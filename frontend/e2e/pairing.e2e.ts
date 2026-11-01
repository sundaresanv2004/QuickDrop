import { Browser, BrowserContext, chromium, expect, Page, test } from "@playwright/test"
import { buildPairLink } from "../lib/pair-link"

const BASE_URL = "http://localhost:3001"
// A separate backend trusts this header, so each test device can act like it's on
// its own network. Real devices can't set it, because production names a proxy header.
const NETWORK_HEADER = "x-e2e-client-ip"
const TEST_BACKEND_PORT = 8010

interface Device {
  context: BrowserContext
  page: Page
  name: string
  tokens: string[]
}

let counter = 0

// A closed device stays in its room during the reconnect window, so every device
// needs its own address to avoid appearing beside a device from an earlier test.
function uniqueNetwork() {
  const value = (Date.now() + counter++) % 16777216
  return `10.${value >> 16}.${(value >> 8) & 255}.${value & 255}`
}

async function createDevice(browser: Browser, label: string, options?: { colorScheme?: "light" | "dark" }): Promise<Device> {
  const name = `E2E ${label} ${Date.now().toString(36)}${counter++}`
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { [NETWORK_HEADER]: uniqueNetwork() },
    colorScheme: options?.colorScheme,
  })
  const page = await context.newPage()
  const tokens: string[] = []

  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const message = JSON.parse(String(payload))
      if (message.type === "pair_link") tokens.push(message.token)
    })
  })
  await page.addInitScript(({ deviceName, port }) => {
    localStorage.setItem("quickdrop_device_name", deviceName)
    const Original = window.WebSocket
    window.WebSocket = new Proxy(Original, {
      construct(target, [url, protocols]) {
        return new target(String(url).replace(":8000/", `:${port}/`), protocols)
      },
    })
  }, { deviceName: name, port: TEST_BACKEND_PORT })

  return { context, page, name, tokens }
}

async function openDiscovery(device: Device) {
  await device.page.goto("/")
  await expect(device.page.getByText(`${device.name} (You)`)).toBeVisible()
  await expect(device.page.getByText("Ready", { exact: true })).toBeVisible()
}

async function openDialog(device: Device) {
  await device.page.getByRole("button", { name: "Connect another way" }).click()
  await expect(device.page.getByRole("dialog")).toBeVisible()
  await expect(device.page.getByText(/Expires in/)).toBeVisible()
  await expect.poll(() => device.tokens.length).toBeGreaterThan(0)
  return device.tokens[device.tokens.length - 1]
}

test.describe("connect another way", () => {
  test.setTimeout(60000)

  let a: Device
  let b: Device
  let partnerBrowser: Browser

  test.beforeEach(async ({ browser }) => {
    partnerBrowser = await chromium.launch()
    a = await createDevice(browser, "A")
    b = await createDevice(partnerBrowser, "B")
    await openDiscovery(a)
    await openDiscovery(b)
  })

  test.afterEach(async () => {
    await a.context.close()
    await partnerBrowser.close()
  })

  test("connects devices on different networks, and still needs consent", async () => {
    // Automatic discovery can't see across networks.
    await expect(a.page.getByText(b.name, { exact: true })).toHaveCount(0)
    await expect(b.page.getByText(a.name, { exact: true })).toHaveCount(0)
    await expect(a.page.getByText("Searching for devices…")).toBeVisible()

    const token = await openDialog(a)
    await expect(a.page.getByRole("img", { name: /QR code/ })).toBeVisible()

    await b.page.goto(buildPairLink(BASE_URL, token))

    // Both devices now see each other, marked as linked, and the code is gone.
    await expect(b.page.getByText(a.name, { exact: true })).toBeVisible()
    await expect(a.page.getByText(b.name, { exact: true })).toBeVisible()
    await expect(a.page.getByRole("dialog")).toHaveCount(0)
    await expect(b.page.getByTitle("Connected by QR code or link")).toBeVisible()
    expect(new URL(b.page.url()).hash).toBe("")

    // The link alone never opens a session.
    await expect(a.page.getByRole("button", { name: "Accept" })).toHaveCount(0)
    await expect(b.page).toHaveURL(`${BASE_URL}/`)

    await b.page.getByText(a.name, { exact: true }).click()
    await a.page.getByRole("button", { name: "Accept" }).click()

    const input = b.page.getByPlaceholder("Type a message...")
    await expect(input).toBeEnabled({ timeout: 20000 })
    await input.fill("connected by qr")
    await input.press("Enter")
    await expect(a.page.getByText("connected by qr")).toBeVisible()
  })

  test("declining keeps the devices apart", async () => {
    const token = await openDialog(a)
    await b.page.goto(buildPairLink(BASE_URL, token))
    await expect(b.page.getByText(a.name, { exact: true })).toBeVisible()

    await b.page.getByText(a.name, { exact: true }).click()
    await a.page.getByRole("button", { name: "Decline" }).click()

    await expect(b.page.getByText("Connection request declined")).toBeVisible()
    await expect(b.page).toHaveURL(`${BASE_URL}/`)
    await expect(a.page).toHaveURL(`${BASE_URL}/`)
  })

  test("a used link can't connect a third device", async ({ browser }) => {
    const token = await openDialog(a)
    await b.page.goto(buildPairLink(BASE_URL, token))
    await expect(b.page.getByText(a.name, { exact: true })).toBeVisible()

    const late = await createDevice(browser, "Late")
    try {
      await late.page.goto(buildPairLink(BASE_URL, token))
      await expect(late.page.getByText("This link has expired or was already used")).toBeVisible()
      await expect(late.page.getByText(a.name, { exact: true })).toHaveCount(0)
    } finally {
      await late.context.close()
    }
  })

  test("closing the dialog cancels its code", async () => {
    const token = await openDialog(a)
    await a.page.keyboard.press("Escape")
    await expect(a.page.getByRole("dialog")).toHaveCount(0)

    await b.page.goto(buildPairLink(BASE_URL, token))
    await expect(b.page.getByText("This link has expired or was already used")).toBeVisible()
    await expect(b.page.getByText(a.name, { exact: true })).toHaveCount(0)
  })

  test("replaces the code when it expires", async ({ browser }) => {
    const timed = await createDevice(browser, "Timed")
    try {
      await timed.page.clock.install()
      await openDiscovery(timed)

      const first = await openDialog(timed)
      await expect(timed.page.getByText("Expires in 5:00")).toBeVisible()

      await timed.page.clock.fastForward("05:01")
      await expect.poll(() => timed.tokens.length).toBe(2)
      expect(timed.tokens[1]).not.toBe(first)
      await expect(timed.page.getByText(/Expires in [45]:/)).toBeVisible()
    } finally {
      await timed.context.close()
    }
  })

  test("the button stays available when devices are already visible", async () => {
    const token = await openDialog(a)
    await b.page.goto(buildPairLink(BASE_URL, token))
    await expect(b.page.getByText(a.name, { exact: true })).toBeVisible()

    await expect(b.page.getByText("Searching for devices…")).toHaveCount(0)
    await expect(b.page.getByRole("button", { name: "Connect another way" })).toBeVisible()
    await openDialog(b)
  })
})

// A browser's own barcode reader confirms the code scans, including in dark mode
// where the rest of the dialog is dark.
for (const colorScheme of ["light", "dark"] as const) {
  test(`the QR code scans to the link in ${colorScheme} mode`, async ({ browserName }) => {
    test.skip(browserName !== "chromium", "Only Chromium has a barcode reader")

    const browser = await chromium.launch()
    try {
      const device = await createDevice(browser, "Scan", { colorScheme })
      await openDiscovery(device)
      const token = await openDialog(device)

      const code = device.page.getByRole("img", { name: /QR code/ })
      const image = await code.locator("xpath=ancestor::div[contains(@class, 'bg-white')]").screenshot()
      const scanned = await device.page.evaluate(async (base64) => {
        const Detector = (window as unknown as { BarcodeDetector?: new (options: object) => { detect(source: ImageBitmap): Promise<{ rawValue: string }[]> } }).BarcodeDetector
        if (!Detector) return null
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }))
        const [result] = await new Detector({ formats: ["qr_code"] }).detect(bitmap)
        return result?.rawValue ?? "unreadable"
      }, image.toString("base64"))

      test.skip(scanned === null, "This Chromium build has no barcode reader")
      expect(scanned).toBe(buildPairLink(BASE_URL, token))
    } finally {
      await browser.close()
    }
  })
}
