import { FileMetaPayload, SystemPayload, ChatMessage } from '@/types/chat';
import { IndexedDBManager } from './IndexedDBManager';

const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED_AMOUNT = 1024 * 1024;

interface FileUploadTask {
  file: File;
  fileId: string;
}

export class FileTransferManager {
  private fileChannel: RTCDataChannel | null = null;
  private systemChannel: RTCDataChannel | null = null;
  private dbManager = new IndexedDBManager();

  private pendingLargeFiles: Map<string, FileMetaPayload> = new Map();
  private incomingFiles: Map<string, { 
    meta: FileMetaPayload, 
    receivedBytes: number, 
    completedBytes: number,
    chunkBuffer: { chunkIndex: number, data: ArrayBuffer }[],
    isPaused?: boolean
  }> = new Map();
  private fileTransferQueue: string[] = []; 
  private senderFileQueue: FileUploadTask[] = [];
  private isProcessingQueue: boolean = false;
  private pendingStreamApprovals: Map<string, (allowed: boolean) => void> = new Map();
  private activeFileStreams: Map<string, FileSystemWritableFileStream> = new Map();
  private fileWriteQueues: Map<string, Promise<void>> = new Map();

  constructor(
    private emitChatMessage: (msg: ChatMessage) => void,
    private emitFileProgress: (fileId: string, progress: number) => void,
    private emitFileComplete: (fileId: string, objectUrl: string | null) => void,
    private emitFileError: (fileId: string, error: string) => void
  ) {
    this.dbManager.init().catch(err => console.error("[IndexedDB] Init failed:", err));
    
    if (typeof window !== "undefined") {
      const clear = () => this.dbManager.clearAll().catch(() => {});
      window.addEventListener("beforeunload", clear);
      window.addEventListener("pagehide", clear);
    }
  }

  public setChannels(fileChannel: RTCDataChannel | null, systemChannel: RTCDataChannel | null) {
    this.fileChannel = fileChannel;
    this.systemChannel = systemChannel;
    
    if (this.fileChannel) {
      this.fileChannel.binaryType = 'arraybuffer';
      this.fileChannel.bufferedAmountLowThreshold = 65536;
      this.fileChannel.onmessage = this.handleFileMessage.bind(this);
    }
  }

  public handleSystemMessage(payload: SystemPayload): boolean {
    if (payload.type === "file_meta") {
      this.emitChatMessage({ 
        id: payload.fileId, 
        type: "file", 
        direction: "received", 
        timestamp: Date.now(),
        file: { 
          fileId: payload.fileId, 
          name: payload.name, 
          size: payload.size, 
          mimeType: payload.mimeType, 
          status: "receiving", 
          progress: 0, 
          objectUrl: null,
          streamingMode: payload.streamingMode
        }
      });
      
      if (!payload.streamingMode) {
        this.incomingFiles.set(payload.fileId, { meta: payload, receivedBytes: 0, completedBytes: 0, chunkBuffer: [] });
        this.fileTransferQueue.push(payload.fileId);
        this.sendSystemMessage({ type: "stream_ready", fileId: payload.fileId });
      } else {
        this.pendingLargeFiles.set(payload.fileId, payload);
      }
      return true;
    } else if (payload.type === "stream_ready") {
      const resolve = this.pendingStreamApprovals.get(payload.fileId);
      if (resolve) {
        resolve(true);
        this.pendingStreamApprovals.delete(payload.fileId);
      }
      return true;
    } else if (payload.type === "file_rejected") {
      console.warn(`[WebRTC] File was rejected by receiver: ${payload.fileId}`);
      this.emitFileError(payload.fileId, "Rejected by receiver");
      
      const resolveReject = this.pendingStreamApprovals.get(payload.fileId);
      if (resolveReject) {
        resolveReject(false);
        this.pendingStreamApprovals.delete(payload.fileId);
      }
      return true;
    }
    return false; // Not a file-related system message
  }

  private sendSystemMessage(payload: SystemPayload) {
    if (!this.systemChannel || this.systemChannel.readyState !== "open") return;
    this.systemChannel.send(JSON.stringify(payload));
  }

  public async sendFile(file: File): Promise<string | undefined> {
    if (!this.fileChannel || this.fileChannel.readyState !== "open") return;
    const fileId = crypto.randomUUID();
    this.senderFileQueue.push({ file, fileId });
    
    this.emitChatMessage({
      id: fileId,
      type: "file",
      direction: "sent",
      timestamp: Date.now(),
      file: { 
        fileId, 
        name: file.name, 
        size: file.size, 
        mimeType: file.type || "application/octet-stream", 
        status: "sending", 
        progress: 0, 
        objectUrl: null,
      }
    });

    this.processSenderQueue();
    return fileId;
  }

  private async processSenderQueue() {
    if (this.isProcessingQueue || this.senderFileQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.senderFileQueue.length > 0) {
      const task = this.senderFileQueue[0];
      if (!task) break;
      
      const totalChunks = Math.ceil(task.file.size / CHUNK_SIZE);
      const streamingMode = task.file.size >= 250 * 1024 * 1024;

      const meta: FileMetaPayload = { 
        type: "file_meta", 
        fileId: task.fileId, 
        name: task.file.name, 
        size: task.file.size, 
        mimeType: task.file.type || "application/octet-stream", 
        totalChunks,
        streamingMode
      };
      
      if (!this.systemChannel || this.systemChannel.readyState !== "open") {
        this.emitFileError(task.fileId, "Channel closed");
        this.senderFileQueue.shift();
        continue;
      }
      this.systemChannel.send(JSON.stringify(meta));

      const isReady = await new Promise<boolean>((resolve) => {
        this.pendingStreamApprovals.set(task.fileId, resolve);
        setTimeout(() => { 
          if (this.pendingStreamApprovals.has(task.fileId)) {
            resolve(false); 
          }
        }, 60000);
      });

      if (!isReady) {
        this.emitFileError(task.fileId, "Receiver declined or timed out");
        this.senderFileQueue.shift();
        continue;
      }

      const LOW_WATERMARK = 256 * 1024;  
      const HIGH_WATERMARK = 1024 * 1024; 
      if (this.fileChannel) {
        this.fileChannel.bufferedAmountLowThreshold = LOW_WATERMARK;
      }

      try {
        let offset = 0;
        let totalSentChunks = 0;

        while (offset < task.file.size) {
          if (!this.fileChannel || this.fileChannel.readyState !== "open") {
            this.emitFileError(task.fileId, "Channel closed during transfer");
            return;
          }

          if (this.fileChannel.bufferedAmount >= HIGH_WATERMARK) {
            await new Promise<void>((resolve) => {
              const onLow = () => {
                this.fileChannel?.removeEventListener("bufferedamountlow", onLow);
                resolve();
              };
              this.fileChannel?.addEventListener("bufferedamountlow", onLow);
              setTimeout(onLow, 500); 
            });
          }

          const end = Math.min(offset + CHUNK_SIZE, task.file.size);
          const chunkData = await task.file.slice(offset, end).arrayBuffer();
          this.fileChannel.send(chunkData);
          offset = end; 
          totalSentChunks++;

          if (totalSentChunks % 64 === 0 || offset >= task.file.size) {
            this.emitFileProgress(task.fileId, Math.min(100, Math.round((offset / task.file.size) * 100)));
          }
        }

        this.emitFileComplete(task.fileId, ""); 
      } catch (err) {
        console.error("[WebRTC] Stream error:", err);
        this.emitFileError(task.fileId, "Streaming error");
      }

      this.senderFileQueue.shift();
    }
    this.isProcessingQueue = false;
  }

  private handleFileMessage(event: MessageEvent) {
    if (!(event.data instanceof ArrayBuffer)) return;
    const activeFileId = this.fileTransferQueue[0];
    if (!activeFileId) return;
    const transfer = this.incomingFiles.get(activeFileId);
    if (!transfer) return;

    const data: ArrayBuffer = event.data;
    const bytesBefore = transfer.receivedBytes;
    transfer.receivedBytes += data.byteLength;
    
    const chunkIndex = Math.floor(transfer.receivedBytes / CHUNK_SIZE); 
    transfer.chunkBuffer.push({ chunkIndex, data });

    const currentMB = Math.floor(transfer.receivedBytes / (1024 * 1024));
    const previousMB = Math.floor(bytesBefore / (1024 * 1024));
    const isWireComplete = transfer.receivedBytes >= transfer.meta.size;

    if (currentMB > previousMB || isWireComplete) {
      const wireProgress = Math.min(100, Math.round((transfer.receivedBytes / transfer.meta.size) * 100));
      this.emitFileProgress(activeFileId, wireProgress);
    }

    if (isWireComplete) {
      this.fileTransferQueue.shift();
    }

    const BATCH_THRESHOLD = 2 * 1024 * 1024;
    const currentBatchSize = transfer.chunkBuffer.length * CHUNK_SIZE;

    if (currentBatchSize >= BATCH_THRESHOLD || isWireComplete) {
      const batch = [...transfer.chunkBuffer];
      const batchBytes = batch.reduce((sum, item) => sum + item.data.byteLength, 0);
      transfer.chunkBuffer = [];

      const prevWrite = this.fileWriteQueues.get(activeFileId) ?? Promise.resolve();
      const thisWrite = prevWrite.then(async () => {
        try {
          const stream = this.activeFileStreams.get(activeFileId);
          if (stream) {
            for (const item of batch) await (stream as any).write(item.data);
          } else {
            await this.dbManager.addChunks(activeFileId, batch);
          }
        } catch (err) {
          console.error("[WebRTC] Write failed:", err);
          this.emitFileError(activeFileId, "Write failed");
          return;
        }
        
        transfer.completedBytes += batchBytes;

        if (transfer.completedBytes >= transfer.meta.size) {
          const stream = this.activeFileStreams.get(activeFileId);
          if (stream) {
            try { await (stream as any).close(); } catch {}
            this.activeFileStreams.delete(activeFileId);
            this.emitFileComplete(activeFileId, "");
          } else {
            this.emitFileComplete(activeFileId, null);
          }
          this.incomingFiles.delete(activeFileId);
          this.fileWriteQueues.delete(activeFileId);
        }
      });
      this.fileWriteQueues.set(activeFileId, thisWrite);
    }
  }

  public async acceptLargeFileStream(fileId: string) {
    const meta = this.pendingLargeFiles.get(fileId);
    if (!meta) return;

    try {
      const hasPicker = typeof window !== 'undefined' && !!(window as any).showSaveFilePicker;
      
      if (hasPicker) {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: meta.name });
        const writable = await handle.createWritable();
        this.activeFileStreams.set(fileId, writable);
      }
      
      this.incomingFiles.set(fileId, { meta, receivedBytes: 0, completedBytes: 0, chunkBuffer: [] });
      this.fileTransferQueue.push(fileId);
      this.pendingLargeFiles.delete(fileId);

      this.sendSystemMessage({ type: "stream_ready", fileId });
      this.emitFileProgress(fileId, 1);
    } catch (err) {
      console.error("[WebRTC] Failed to initialize file transfer:", err);
      this.rejectFile(fileId);
    }
  }

  public rejectFile(fileId: string) {
    this.pendingLargeFiles.delete(fileId);
    this.sendSystemMessage({ type: "file_rejected", fileId });
    this.emitFileError(fileId, "Rejected by you");
  }

  public async getDownloadUrl(fileId: string, mimeType: string): Promise<string> {
    const blob = await this.dbManager.getFileBlob(fileId, mimeType);
    return URL.createObjectURL(blob);
  }

  public failAllActiveTransfers(reason: string) {
    for (const [fileId] of this.incomingFiles) {
      this.emitFileError(fileId, reason);
    }
    this.incomingFiles.clear();
    this.fileTransferQueue = [];
    this.fileWriteQueues.clear();

    for (const task of this.senderFileQueue) {
      this.emitFileError(task.fileId, reason);
    }
    this.senderFileQueue = [];
    this.isProcessingQueue = false;
  }

  public cleanup() {
    this.failAllActiveTransfers("Connection closed");
    this.pendingStreamApprovals.clear();
    this.activeFileStreams.clear();
    this.dbManager.clearAll().catch(e => console.error("[IndexedDB] Clear failed", e));
    
    if (this.fileChannel) {
      this.fileChannel.close();
      this.fileChannel = null;
    }
    if (this.systemChannel) {
      this.systemChannel.close();
      this.systemChannel = null;
    }
  }
}
