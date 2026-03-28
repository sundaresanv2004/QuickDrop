export class IndexedDBManager {
  private dbName = "QuickDropDB";
  private storeName = "file_chunks";
  private db: IDBDatabase | null = null;
  private version = 1;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        return resolve();
      }
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          // Auto increment key, index by fileId for easy retrieval
          const store = db.createObjectStore(this.storeName, { autoIncrement: true });
          store.createIndex("fileId", "fileId", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error("[IndexedDB] Failed to open DB", event);
        reject(request.error);
      };
    });
  }

  async addChunks(fileId: string, chunks: { chunkIndex: number, data: ArrayBuffer }[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error("IndexedDB is not initialized"));
      }

      const transaction = this.db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      
      chunks.forEach(({ chunkIndex, data }) => {
        store.add({
          fileId,
          chunkIndex,
          data,
        });
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getFileBlob(fileId: string, mimeType: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error("IndexedDB is not initialized"));
      }

      const transaction = this.db.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const index = store.index("fileId");
      
      const range = IDBKeyRange.only(fileId);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const records = request.result;
        
        // Sort explicitly by chunkIndex to ensure perfect binary assembly
        records.sort((a, b) => a.chunkIndex - b.chunkIndex);
        
        const chunks = records.map(r => r.data);
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();

      const transaction = this.db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const index = store.index("fileId");
      const range = IDBKeyRange.only(fileId);
      
      // We must use a cursor to iterate and delete all records matching the index
      const request = index.openCursor(range);
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue(); // Move to next record
        } else {
          resolve(); // Done iterating
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const transaction = this.db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
