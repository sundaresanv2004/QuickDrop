"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { formatFileSize } from "@/lib/utils"
import { webRTCManager } from "@/lib/webrtc/WebRTCManager"
import type { RoomInfo } from "@/types/messages"
import { DeviceCapabilities, readCapabilities } from "@/lib/diagnostics/capabilities"
import { CandidateKind, ConnectionLog, loadConnectionLog } from "@/lib/diagnostics/connection-log"
import { createResult, loadResults, saveResults, TestResult, TestStatus } from "@/lib/diagnostics/results"
import { SAVE_METHOD_LABELS, SaveMethod, saveTestFile } from "@/lib/diagnostics/save-methods"
import { runStorageTest, StorageTestError, StorageTestProgress, StorageTestResult, testFileName } from "@/lib/diagnostics/storage-test"

const GIB = 1024 ** 3
const TEST_SIZES = [1 * GIB, 3 * GIB, 5 * GIB]
const SAVE_METHODS: SaveMethod[] = ["blob-url", "service-worker", "web-share"]

const PHASE_LABELS: Record<StorageTestProgress["phase"], string> = {
  write: "Writing",
  verify: "Verifying",
  read: "Reading",
}

const STATUS_LABELS: Record<TestStatus, string> = {
  running: "Running",
  "awaiting-confirmation": "Check the file",
  pass: "Passed",
  fail: "Failed",
  cancelled: "Cancelled",
  interrupted: "Page closed",
}

const STATUS_COLORS: Record<TestStatus, string> = {
  running: "text-muted-foreground",
  "awaiting-confirmation": "text-amber-600 dark:text-amber-400",
  pass: "text-green-600 dark:text-green-400",
  fail: "text-destructive",
  cancelled: "text-muted-foreground",
  interrupted: "text-destructive",
}

function speed(bytes: number, ms: number) {
  return ms > 0 ? `${formatFileSize((bytes / ms) * 1000)}/s` : "-"
}

function formatCandidates(candidates: Partial<Record<CandidateKind, number>>) {
  const entries = Object.entries(candidates)
  return entries.length ? entries.map(([kind, count]) => `${kind} × ${count}`).join(", ") : "None"
}

function describeError(error: unknown) {
  if (error instanceof StorageTestError) {
    const { phase, bytesDone } = error.detail
    return `${error.message} (${phase}, after ${formatFileSize(bytesDone)})`
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export default function DiagnosticsPanel() {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [connection, setConnection] = useState<ConnectionLog | null>(null)
  const [results, setResults] = useState<TestResult[]>([])
  const [selectedSize, setSelectedSize] = useState(TEST_SIZES[0])
  const [progress, setProgress] = useState<StorageTestProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<string | null>(null)

  const resultsRef = useRef<TestResult[]>([])
  const cancelRef = useRef<(() => void) | null>(null)

  const commitResults = useCallback((next: TestResult[]) => {
    resultsRef.current = next
    saveResults(next)
    setResults(next)
  }, [])

  const updateResult = useCallback((id: string, changes: Partial<TestResult>) => {
    commitResults(resultsRef.current.map((result) => (result.id === id ? { ...result, ...changes } : result)))
  }, [commitResults])

  useEffect(() => {
    const timer = setTimeout(() => {
      commitResults(loadResults())
      setConnection(loadConnectionLog())
      setRoom(webRTCManager.roomInfo)
    }, 0)
    readCapabilities().then(setCapabilities).catch((error) => console.error("[Diagnostics] Probe failed:", error))
    const unsubscribe = webRTCManager.on("room_info", setRoom)
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [commitResults])

  const runTracked = async (
    test: string,
    sizeBytes: number,
    start: () => { result: Promise<StorageTestResult>; cancel: () => void },
    summarize: (result: StorageTestResult) => string
  ) => {
    const startedAt = Date.now()
    const entry = createResult(test, sizeBytes, startedAt)
    commitResults([entry, ...resultsRef.current])
    setRunning(true)
    setProgress(null)

    const wakeLock = await navigator.wakeLock?.request("screen").catch(() => null)
    try {
      const { result, cancel } = start()
      cancelRef.current = cancel
      const outcome = await result
      updateResult(entry.id, { status: "pass", detail: summarize(outcome), durationMs: Date.now() - startedAt })
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError"
      updateResult(entry.id, {
        status: cancelled ? "cancelled" : "fail",
        detail: cancelled ? "" : describeError(error),
        durationMs: Date.now() - startedAt,
      })
    } finally {
      cancelRef.current = null
      setRunning(false)
      setProgress(null)
      await wakeLock?.release().catch(() => {})
    }
  }

  const runStorage = (totalBytes: number) =>
    runTracked(
      "Write and verify on disk",
      totalBytes,
      () => runStorageTest({ kind: "write-verify", name: testFileName(totalBytes), totalBytes }, setProgress),
      ({ bytes, writeMs, readMs }) => `Write ${speed(bytes, writeMs)}, verify ${speed(bytes, readMs)}`
    )

  const runRead = (file: File, verifyPattern: boolean) =>
    runTracked(
      verifyPattern ? "Check saved file" : "Read picked file",
      file.size,
      () => runStorageTest({ kind: "read-file", file, verifyPattern }, setProgress),
      ({ bytes, readMs }) =>
        `${verifyPattern ? "Contents match. " : ""}Read ${speed(bytes, readMs)}${file.type ? `, ${file.type}` : ""}`
    )

  const runSave = async (method: SaveMethod) => {
    const now = Date.now()
    const entry = createResult(`Save: ${SAVE_METHOD_LABELS[method]}`, selectedSize, now)
    commitResults([entry, ...resultsRef.current])
    try {
      await saveTestFile(method, testFileName(selectedSize))
      updateResult(entry.id, {
        status: "awaiting-confirmation",
        detail: "Find the saved file, then choose Saved or Failed.",
      })
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError"
      updateResult(entry.id, {
        status: cancelled ? "cancelled" : "fail",
        detail: cancelled ? "" : describeError(error),
      })
    }
  }

  const deleteTestFiles = async () => {
    setRunning(true)
    try {
      await runStorageTest({ kind: "delete-files" }).result
      toast.success("Test files deleted")
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setRunning(false)
    }
  }

  const copyReport = async () => {
    const text = JSON.stringify({ capabilities, room, connection, results: resultsRef.current }, null, 2)
    setReport(text)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Report copied")
    } catch {
      toast.info("Copy the report from the box below")
    }
  }

  const freeBytes =
    capabilities?.quotaBytes != null ? capabilities.quotaBytes - (capabilities.usageBytes ?? 0) : null

  return (
    <section className="mt-10 pb-16 space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Device diagnostics</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tests what this browser can handle for large transfers. Keep this page open and in front while a test runs.
        </p>
      </div>

      <Card title="Network">
        <Row label="Room code" value={room ? `${room.hint} (IPv${room.ip_version})` : "Not connected"} />
        <p className="text-xs text-muted-foreground">
          Devices can discover each other only when they show the same room code.
        </p>
        <Row label="Connection types found" value={capabilities ? formatCandidates(capabilities.iceCandidates) : "Checking…"} />
      </Card>

      <Card title="Last connection attempt">
        {connection ? (
          <>
            <Row label="Role" value={connection.role} />
            <Row label="States" value={connection.states.join(" → ") || "Never changed state"} />
            <Row label="Connected after" value={connection.connectedAfterMs === null ? "Did not connect" : `${connection.connectedAfterMs} ms`} />
            <Row label="This device offered" value={formatCandidates(connection.localCandidates)} />
            <Row label="Other device offered" value={formatCandidates(connection.remoteCandidates)} />
            <Row
              label="Route used"
              value={connection.selectedPair
                ? `${connection.selectedPair.local} ↔ ${connection.selectedPair.remote} (${connection.selectedPair.protocol})`
                : "None"}
            />
            <Row label="Largest message" value={connection.maxMessageSize ? formatFileSize(connection.maxMessageSize) : "Unknown"} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Try connecting to a device, then come back to this page.</p>
        )}
      </Card>

      <Card title="Browser features">
        {capabilities ? (
          <>
            <Row label="HTTPS (secure context)" value={yesNo(capabilities.secureContext)} />
            <Row label="Private disk storage (OPFS)" value={yesNo(capabilities.opfs)} />
            <Row label="Fast worker file access" value={yesNo(capabilities.syncAccessHandle)} />
            <Row label="Writable file streams" value={yesNo(capabilities.createWritable)} />
            <Row label="Save file picker" value={yesNo(capabilities.saveFilePicker)} />
            <Row label="Service Workers" value={yesNo(capabilities.serviceWorker)} />
            <Row label="Share files" value={yesNo(capabilities.webShare)} />
            <Row label="Keep screen awake" value={yesNo(capabilities.wakeLock)} />
            <Row label="Web Locks" value={yesNo(capabilities.webLocks)} />
            <Row label="WebRTC" value={yesNo(capabilities.webRTC)} />
            <Row label="Storage kept under pressure" value={capabilities.storagePersisted === null ? "Unknown" : yesNo(capabilities.storagePersisted)} />
            <Row label="Storage available" value={freeBytes === null ? "Unknown" : formatFileSize(freeBytes)} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Checking…</p>
        )}
      </Card>

      <Card title="1. Disk test">
        <p className="text-sm text-muted-foreground">
          Writes a test file to this browser&apos;s private storage, then reads it back and checks every block.
        </p>
        <div className="flex flex-wrap gap-2">
          {TEST_SIZES.map((size) => (
            <Button key={size} variant="outline" disabled={running} onClick={() => runStorage(size)}>
              Test {formatFileSize(size)}
            </Button>
          ))}
        </div>
        {freeBytes !== null && freeBytes < TEST_SIZES[TEST_SIZES.length - 1] * 2 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            The 5 GB test needs about 10 GB free, because saving makes a second copy.
          </p>
        )}
        {running && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {progress
                  ? `${PHASE_LABELS[progress.phase]}: ${formatFileSize(progress.bytesDone)} of ${formatFileSize(progress.totalBytes)}`
                  : "Starting…"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => cancelRef.current?.()}>Cancel</Button>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${progress ? (progress.bytesDone / progress.totalBytes) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      <Card title="2. Save test">
        <p className="text-sm text-muted-foreground">
          Run the disk test first. Then try each way of saving that file, and check it in the next step.
        </p>
        <div className="flex flex-wrap gap-2">
          {TEST_SIZES.map((size) => (
            <Button key={size} size="sm" variant={size === selectedSize ? "default" : "outline"} onClick={() => setSelectedSize(size)}>
              {formatFileSize(size)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SAVE_METHODS.map((method) => (
            <Button key={method} variant="outline" disabled={running} onClick={() => runSave(method)}>
              {SAVE_METHOD_LABELS[method]}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="3. Check saved file">
        <p className="text-sm text-muted-foreground">
          Choose the file you just saved. This confirms its full contents arrived intact.
        </p>
        <FilePicker label="Choose saved file" disabled={running} onPick={(file) => runRead(file, true)} />
      </Card>

      <Card title="4. Sending test">
        <p className="text-sm text-muted-foreground">
          Pick a large video. This shows whether the Photos or Files picker changes its size and how quickly it can be read.
        </p>
        <div className="flex flex-wrap gap-2">
          <FilePicker label="Choose from Photos" accept="image/*,video/*" disabled={running} onPick={(file) => runRead(file, false)} />
          <FilePicker label="Choose from Files" disabled={running} onPick={(file) => runRead(file, false)} />
        </div>
      </Card>

      <Card title="Results">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tests run yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {results.map((result) => (
              <li key={result.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="font-medium min-w-0">
                    {result.test}
                    {result.sizeBytes ? ` · ${formatFileSize(result.sizeBytes)}` : ""}
                  </span>
                  <span className={`shrink-0 font-semibold ${STATUS_COLORS[result.status]}`}>{STATUS_LABELS[result.status]}</span>
                </div>
                {result.detail && <p className="text-xs text-muted-foreground break-words">{result.detail}</p>}
                {result.durationMs !== null && (
                  <p className="text-xs text-muted-foreground">Took {Math.round(result.durationMs / 1000)} seconds</p>
                )}
                {result.status === "awaiting-confirmation" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateResult(result.id, { status: "pass", detail: "Confirmed saved on this device." })}>Saved</Button>
                    <Button size="sm" variant="outline" onClick={() => updateResult(result.id, { status: "fail", detail: "Reported as not saved." })}>Failed</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="default" onClick={copyReport}>Copy report</Button>
          <Button variant="outline" disabled={running} onClick={deleteTestFiles}>Delete test files</Button>
          <Button variant="ghost" disabled={running} onClick={() => { commitResults([]); setReport(null) }}>Clear results</Button>
        </div>
        {report && (
          <textarea
            readOnly
            value={report}
            aria-label="Diagnostics report"
            className="w-full h-40 rounded-lg border border-border/40 bg-background p-3 font-mono text-xs"
          />
        )}
      </Card>
    </section>
  )
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No"
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-sm space-y-3">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right min-w-0 break-words">{value}</span>
    </div>
  )
}

function FilePicker({
  label,
  accept,
  disabled,
  onPick,
}: {
  label: string
  accept?: string
  disabled: boolean
  onPick: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>{label}</Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onPick(file)
        }}
      />
    </>
  )
}
