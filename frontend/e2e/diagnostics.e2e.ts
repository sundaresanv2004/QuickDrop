import { rm, stat } from "node:fs/promises"
import { chromium, expect, Page, test } from "@playwright/test"
import type { TestResult } from "../lib/diagnostics/results"
import type { ConnectionLog } from "../lib/diagnostics/connection-log"

const SIZE_GIB = Number(process.env.E2E_SIZE_GIB ?? 1)
const SIZE_BYTES = SIZE_GIB * 1024 ** 3
const SAVE_METHODS = ["Download link", "Service Worker stream"]

async function latestResult(page: Page, minimumRows: number) {
  let latest: TestResult | undefined
  await expect
    .poll(
      async () => {
        const rows: TestResult[] = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("quickdrop_diag_results") ?? "[]")
        )
        latest = rows.length >= minimumRows ? rows[0] : undefined
        return latest?.status ?? "running"
      },
      { timeout: 8 * 60 * 1000, intervals: [500] }
    )
    .not.toBe("running")
  return latest!
}

// Names are unique so a test can never send a request to a real nearby device.
function uniqueName(label: string) {
  return `E2E ${label} ${Date.now().toString(36)}`
}

async function openAs(page: Page, name: string) {
  await page.addInitScript((deviceName) => localStorage.setItem("quickdrop_device_name", deviceName), name)
  await page.goto("/")
  await expect(page.getByText(`${name} (You)`)).toBeVisible()
}

test("reports browser capabilities without page errors", async ({ page, browserName }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })

  await page.goto("/health")
  await expect(page.getByText("Storage available")).toBeVisible({ timeout: 15000 })
  await page.getByRole("button", { name: "Copy report" }).click()
  const report = await page.getByRole("textbox", { name: "Diagnostics report" }).inputValue()
  console.log(`[${browserName}] capabilities`, report)

  expect(errors).toEqual([])
})

// Default Playwright contexts behave like private windows, so this uses a real profile.
test(`stores and saves a ${SIZE_GIB} GiB file intact in a normal window`, async ({ playwright, browserName }, testInfo) => {
  const profile = testInfo.outputPath("profile")
  const context = await playwright[browserName].launchPersistentContext(profile, {
    baseURL: "http://localhost:3001",
    acceptDownloads: true,
  })

  try {
    const page = await context.newPage()
    await page.goto("/health")
    await expect(page.getByText("Storage available")).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: `Test ${SIZE_GIB} GB` }).click()

    const disk = await latestResult(page, 1)
    console.log(`[${browserName}] disk test`, disk.status, disk.detail)
    expect(disk.status, disk.detail).toBe("pass")

    await page.getByRole("button", { name: `${SIZE_GIB} GB`, exact: true }).click()

    let rows = 1
    const failures: string[] = []
    for (const method of SAVE_METHODS) {
      const pendingDownload = page.waitForEvent("download", { timeout: 5 * 60 * 1000 })
      await page.getByRole("button", { name: method }).click()
      rows += 1

      try {
        const download = await pendingDownload
        const path = await download.path()
        const { size } = await stat(path)
        console.log(`[${browserName}] ${method}: saved ${size} bytes as ${download.suggestedFilename()}`)
        expect(size).toBe(SIZE_BYTES)

        await page.locator("input[type=file]").first().setInputFiles(path)
        rows += 1
        const check = await latestResult(page, rows)
        console.log(`[${browserName}] ${method}: contents ${check.status} ${check.detail}`)
        expect(check.status, check.detail).toBe("pass")
      } catch (error) {
        console.log(`[${browserName}] ${method}: FAILED ${error}`)
        failures.push(`${method}: ${error}`)
        rows = (await page.evaluate(() => JSON.parse(localStorage.getItem("quickdrop_diag_results") ?? "[]"))).length
      }
    }
    expect(failures).toEqual([])
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})

test("reports a clear result in a private window", async ({ page, browserName }) => {
  await page.goto("/health")
  await expect(page.getByText("Storage available")).toBeVisible({ timeout: 15000 })
  await page.getByRole("button", { name: "Test 1 GB" }).click()

  const disk = await latestResult(page, 1)
  console.log(`[${browserName}] private window`, disk.status, disk.detail)
  expect(["pass", "fail"]).toContain(disk.status)
  if (disk.status === "fail") expect(disk.detail).not.toBe("")
  await page.getByRole("button", { name: "Delete test files" }).click()
})

test("connects to a different browser engine and chats", async ({ page, browserName }) => {
  const otherBrowser = await chromium.launch()
  const other = await otherBrowser.newPage({ baseURL: "http://localhost:3001" })

  try {
    const myName = uniqueName(browserName)
    const otherName = uniqueName("chromium-peer")
    await openAs(page, myName)
    await openAs(other, otherName)

    await page.getByText(otherName, { exact: true }).click()
    await other.getByRole("button", { name: "Accept" }).click()

    await expect(page).toHaveURL(/\/chat\//, { timeout: 15000 })
    const input = page.getByPlaceholder("Type a message...")
    await expect(input).toBeEnabled({ timeout: 30000 })

    await input.fill("hello from e2e")
    await input.press("Enter")
    await expect(other.getByText("hello from e2e")).toBeVisible()

    const log: ConnectionLog = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("quickdrop_diag_connection") ?? "null")
    )
    console.log(`[${browserName}] connection`, JSON.stringify(log))
    expect(log.connectedAfterMs).not.toBeNull()
  } finally {
    await otherBrowser.close()
  }
})
