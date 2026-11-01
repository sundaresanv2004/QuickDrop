// Results are saved before each test starts. If iOS kills the tab mid-test,
// the reloaded page can report that as a failure instead of losing it.

export type TestStatus = "running" | "awaiting-confirmation" | "pass" | "fail" | "cancelled" | "interrupted"

export interface TestResult {
  id: string
  test: string
  sizeBytes: number | null
  status: TestStatus
  detail: string
  startedAt: number
  durationMs: number | null
}

const STORAGE_KEY = "quickdrop_diag_results"

export function createResult(test: string, sizeBytes: number | null, now: number): TestResult {
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    test,
    sizeBytes,
    status: "running",
    detail: "",
    startedAt: now,
    durationMs: null,
  }
}

export function markInterrupted(results: TestResult[]): TestResult[] {
  return results.map((result): TestResult =>
    result.status === "running"
      ? { ...result, status: "interrupted", detail: "The page closed or reloaded during this test. iOS may have run out of memory." }
      : result
  )
}

export function loadResults(): TestResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? markInterrupted(JSON.parse(raw) as TestResult[]) : []
  } catch {
    return []
  }
}

export function saveResults(results: TestResult[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
  } catch {
    // The results still appear on screen if storage is full.
  }
}
