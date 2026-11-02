import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { BrowserContext, expect, Page, PlaywrightWorkerArgs, test, TestInfo } from "@playwright/test"

type Playwright = PlaywrightWorkerArgs["playwright"]

const BASE_URL = "http://localhost:3001"
const NETWORK_HEADER = "x-e2e-client-ip"
const TEST_BACKEND_PORT = 8010
const MIB = 1024 ** 2
const GIB = 1024 ** 3
const LARGE_SIZE = Number(process.env.E2E_TRANSFER_GIB ?? 1) * GIB
const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

type EngineName = "chromium" | "webkit"

interface Device {
  context: BrowserContext
  page: Page
  name: string
  logs: string[]
}

let counter = 0

// Both devices share one address, so they share a room. It's unique to each test,
// because a closed device stays visible during its reconnect window.
function uniqueNetwork() {
  const value = (Date.now() + counter++) % 16777216
  return `10.${value >> 16}.${(value >> 8) & 255}.${value & 255}`
}

interface DeviceOptions {
  network: string
  privateWindow?: boolean
  userAgent?: string
  initScript?: () => void
  keepSavePicker?: boolean
}

async function createDevice(
  playwright: Playwright,
  engine: EngineName,
  label: string,
  testInfo: TestInfo,
  options: DeviceOptions
): Promise<Device> {
  const name = `E2E ${label} ${Date.now().toString(36)}${counter++}`
  const settings = {
    baseURL: BASE_URL,
    acceptDownloads: true,
    extraHTTPHeaders: { [NETWORK_HEADER]: options.network },
    userAgent: options.userAgent,
  }
  const browserType = playwright[engine]
  const context = options.privateWindow
    ? await (await browserType.launch()).newContext(settings)
    // A real profile, because Playwright's default contexts behave like private windows.
    : await browserType.launchPersistentContext(testInfo.outputPath(`profile-${counter++}`), settings)

  const page = await context.newPage()
  const logs: string[] = []
  page.on("console", (message) => logs.push(message.text()))

  await page.addInitScript(({ deviceName, port, keepSavePicker }) => {
    localStorage.setItem("quickdrop_device_name", deviceName)
    const Original = window.WebSocket
    window.WebSocket = new Proxy(Original, {
      construct(target, [url, protocols]) {
        return new target(String(url).replace(":8000/", `:${port}/`), protocols)
      },
    })
    // Tests can't operate a native save dialog, so browser storage is used instead.
    if (!keepSavePicker) delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  }, { deviceName: name, port: TEST_BACKEND_PORT, keepSavePicker: !!options.keepSavePicker })
  if (options.initScript) await page.addInitScript(options.initScript)

  await page.goto("/")
  await expect(page.getByText(`${name} (You)`)).toBeVisible()
  return { context, page, name, logs }
}

async function connect(requester: Device, responder: Device) {
  await requester.page.getByText(responder.name, { exact: true }).click()
  await responder.page.getByRole("button", { name: "Accept" }).click()
  for (const device of [requester, responder]) {
    await expect(device.page.getByPlaceholder("Type a message...")).toBeEnabled({ timeout: 30000 })
  }
}

async function createTestFile(testInfo: TestInfo, name: string, size: number) {
  const filePath = testInfo.outputPath(name)
  await mkdir(path.dirname(filePath), { recursive: true })
  const hash = createHash("sha256")
  const stream = createWriteStream(filePath)

  let seed = 0x12345678
  for (let written = 0; written < size; written += MIB) {
    const block = Buffer.alloc(Math.min(MIB, size - written))
    for (let i = 0; i + 4 <= block.length; i += 4096) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      block.writeUInt32LE(seed, i)
    }
    hash.update(block)
    if (!stream.write(block)) await new Promise((resolve) => stream.once("drain", resolve))
  }
  await new Promise<void>((resolve, reject) => stream.end((error?: Error | null) => (error ? reject(error) : resolve())))
  return { filePath, sha256: hash.digest("hex"), name: path.basename(filePath) }
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest("hex")
}

function sendFile(device: Device, filePath: string) {
  return device.page.locator("input[type=file]").first().setInputFiles(filePath)
}

function acceptFile(device: Device) {
  return device.page.getByRole("button", { name: "Accept", exact: true }).click()
}

async function expectDownloadMatches(receiver: Device, file: { name: string; sha256: string }) {
  const button = receiver.page.getByRole("button", { name: `Download ${file.name}` }).first()
  await expect(button).toBeVisible({ timeout: 8 * 60 * 1000 })

  const pending = receiver.page.waitForEvent("download", { timeout: 8 * 60 * 1000 })
  await button.click()
  const download = await pending
  expect(download.suggestedFilename()).toBe(file.name)
  expect(await hashFile(await download.path())).toBe(file.sha256)
}

// Watches for the page freezing, and page memory on browsers that report it.
async function startWatchingPage(device: Device) {
  await device.page.evaluate(() => {
    const scope = window as unknown as { __watch: { maxGapMs: number; peakHeap: number; last: number } }
    scope.__watch = { maxGapMs: 0, peakHeap: 0, last: performance.now() }
    setInterval(() => {
      const now = performance.now()
      scope.__watch.maxGapMs = Math.max(scope.__watch.maxGapMs, now - scope.__watch.last)
      scope.__watch.last = now
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      if (memory) scope.__watch.peakHeap = Math.max(scope.__watch.peakHeap, memory.usedJSHeapSize)
    }, 20)
  })
}

async function readWatch(device: Device) {
  return device.page.evaluate(() => {
    const { maxGapMs, peakHeap } = (window as unknown as { __watch: { maxGapMs: number; peakHeap: number } }).__watch
    return { maxGapMs: Math.round(maxGapMs), peakHeapMiB: Math.round(peakHeap / (1024 * 1024)) }
  })
}

async function waitForProgress(device: Device, minimumPercent: number) {
  await expect.poll(async () => {
    const texts = await device.page.locator('[data-slot="attachment-description"]').allInnerTexts()
    const match = texts.join(" ").match(/(\d+)%/)
    return match ? Number(match[1]) : 0
  }, { timeout: 120000, intervals: [50] }).toBeGreaterThanOrEqual(minimumPercent)
}

// Lets a test break the connection, which can't really be cut on localhost.
function captureChannels() {
  const channels: RTCDataChannel[] = []
  const create = RTCPeerConnection.prototype.createDataChannel
  RTCPeerConnection.prototype.createDataChannel = function (...args: Parameters<typeof create>) {
    const channel = create.apply(this, args)
    channels.push(channel)
    return channel
  }
  const Original = window.RTCPeerConnection
  window.RTCPeerConnection = new Proxy(Original, {
    construct(target, args) {
      const pc = new target(...(args as [RTCConfiguration]))
      pc.addEventListener("datachannel", (event) => channels.push(event.channel))
      return pc
    },
  })
  ;(window as unknown as { __closeFileChannel: () => void }).__closeFileChannel = () => {
    channels.filter((channel) => channel.label === "files").at(-1)?.close()
  }
}

// Flips one bit in one frame, as damage that the connection's own checks wouldn't catch.
function corruptOneFrame() {
  const send = RTCDataChannel.prototype.send as (data: unknown) => void
  let binaryFrames = 0
  RTCDataChannel.prototype.send = function (this: RTCDataChannel, data: unknown) {
    if (data instanceof ArrayBuffer && ++binaryFrames === 200) {
      const bytes = new Uint8Array(data)
      bytes[bytes.length - 1] ^= 1
    }
    send.call(this, data)
  }
}

// Two WebKit browsers can't connect in Playwright's build, so the other device is always Chromium.
const PEER_ENGINE: EngineName = "chromium"

test.describe("file transfer", () => {
  test.setTimeout(12 * 60 * 1000)

  const devices: Device[] = []
  const track = (device: Device) => {
    devices.push(device)
    return device
  }

  test.afterEach(async ({}, testInfo) => {
    for (const device of devices.splice(0)) {
      await device.context.close()
      await device.context.browser()?.close()
    }
    await rm(testInfo.outputDir, { recursive: true, force: true })
  })

  async function pair(
    playwright: Playwright,
    testInfo: TestInfo,
    senderEngine: EngineName,
    receiverEngine: EngineName,
    senderOptions: Partial<DeviceOptions> = {},
    receiverOptions: Partial<DeviceOptions> = {}
  ) {
    const network = uniqueNetwork()
    const sender = track(await createDevice(playwright, senderEngine, "Sender", testInfo, { network, ...senderOptions }))
    const receiver = track(await createDevice(playwright, receiverEngine, "Receiver", testInfo, { network, ...receiverOptions }))
    await connect(sender, receiver)
    return { sender, receiver }
  }

  for (const direction of ["sends", "receives"] as const) {
    test(`${direction} a large file intact while staying responsive`, async ({ browserName, playwright }, testInfo) => {
      const project = browserName as EngineName
      const senderEngine = direction === "sends" ? project : PEER_ENGINE
      const receiverEngine = direction === "sends" ? PEER_ENGINE : project
      const { sender, receiver } = await pair(playwright, testInfo, senderEngine, receiverEngine)
      const file = await createTestFile(testInfo, "large.bin", LARGE_SIZE)

      await startWatchingPage(sender)
      await startWatchingPage(receiver)
      const started = Date.now()

      await sendFile(sender, file.filePath)
      await acceptFile(receiver)

      // Chat keeps working while the file is moving.
      await waitForProgress(receiver, 5)
      const input = sender.page.getByPlaceholder("Type a message...")
      await input.fill("still responsive")
      await input.press("Enter")
      await expect(receiver.page.getByText("still responsive")).toBeVisible({ timeout: 2000 })

      await expect(receiver.page.getByRole("button", { name: `Download ${file.name}` }).first()).toBeVisible({ timeout: 8 * 60 * 1000 })
      const seconds = (Date.now() - started) / 1000
      await expect(sender.page.getByText(/· Sent$/)).toBeVisible({ timeout: 10000 })

      const senderWatch = await readWatch(sender)
      const receiverWatch = await readWatch(receiver)
      console.log(
        `[${senderEngine} → ${receiverEngine}] ${LARGE_SIZE / MIB} MiB in ${seconds.toFixed(1)}s ` +
        `(${(LARGE_SIZE / MIB / seconds).toFixed(0)} MiB/s). ` +
        `Longest freeze: sender ${senderWatch.maxGapMs}ms, receiver ${receiverWatch.maxGapMs}ms. ` +
        `Peak page memory: sender ${senderWatch.peakHeapMiB} MiB, receiver ${receiverWatch.peakHeapMiB} MiB.`
      )

      expect(senderWatch.maxGapMs).toBeLessThan(1000)
      expect(receiverWatch.maxGapMs).toBeLessThan(1000)
      await expectDownloadMatches(receiver, file)
    })
  }

  test("resumes without starting over when the connection breaks", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, PEER_ENGINE, { initScript: captureChannels })
    const file = await createTestFile(testInfo, "resume.bin", GIB)

    await sendFile(sender, file.filePath)
    await acceptFile(receiver)
    await waitForProgress(receiver, 15)

    await sender.page.evaluate(() => (window as unknown as { __closeFileChannel: () => void }).__closeFileChannel())
    await expectDownloadMatches(receiver, file)
    await expect(sender.page.getByText(/· Sent$/)).toBeVisible({ timeout: 10000 })

    const resumed = sender.logs.find((line) => line.includes("Resuming"))
    console.log(`[${browserName}] ${resumed}`)
    const offset = Number(resumed?.match(/from byte (\d+)/)?.[1])
    expect(offset).toBeGreaterThan(0.1 * GIB)
    expect(sender.logs.some((line) => line.includes("rebuilding the connection"))).toBe(true)

    // Chat works on the rebuilt connection too.
    const input = receiver.page.getByPlaceholder("Type a message...")
    await input.fill("after the rebuild")
    await input.press("Enter")
    await expect(sender.page.getByText("after the rebuild")).toBeVisible()
  })

  test("detects damaged data and sends that part again", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, PEER_ENGINE, { initScript: corruptOneFrame })
    const file = await createTestFile(testInfo, "damaged.bin", 200 * MIB)

    await sendFile(sender, file.filePath)
    await acceptFile(receiver)
    await expectDownloadMatches(receiver, file)

    expect(receiver.logs.some((line) => line.includes("failed its checksum"))).toBe(true)
    expect(sender.logs.some((line) => line.includes("Resuming"))).toBe(true)
  })

  test("works with the smaller window used on phones", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, "chromium", browserName as EngineName, {}, { userAgent: IPHONE_USER_AGENT })
    const file = await createTestFile(testInfo, "phone.bin", 200 * MIB)

    await sendFile(sender, file.filePath)
    await acceptFile(receiver)
    await expectDownloadMatches(receiver, file)
  })

  test("small files don't ask for acceptance, and empty files work", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, "chromium")
    const small = await createTestFile(testInfo, "small.bin", 3 * MIB + 123)
    const empty = await createTestFile(testInfo, "empty.bin", 0)

    await sendFile(sender, small.filePath)
    await expectDownloadMatches(receiver, small)

    await sendFile(sender, empty.filePath)
    await expectDownloadMatches(receiver, empty)
    await expect(receiver.page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0)
  })

  test("sends several files in order", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, "chromium")
    const files = await Promise.all(["one.bin", "two.bin", "three.bin"].map((name, index) =>
      createTestFile(testInfo, name, (index + 1) * 2 * MIB)
    ))

    await sender.page.locator("input[type=file]").first().setInputFiles(files.map((file) => file.filePath))
    for (const file of files) await expectDownloadMatches(receiver, file)
  })

  test("declining tells the sender and sends nothing", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, "chromium")
    const file = await createTestFile(testInfo, "declined.bin", 150 * MIB)

    await sendFile(sender, file.filePath)
    await receiver.page.getByRole("button", { name: "Decline", exact: true }).click()

    await expect(sender.page.getByText("They declined this file")).toBeVisible()
    await expect(receiver.page.getByText("You declined this file")).toBeVisible()
    await expect(receiver.page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0)
  })

  for (const side of ["sender", "receiver"] as const) {
    test(`the ${side} can cancel mid-transfer`, async ({ browserName, playwright }, testInfo) => {
      const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, "chromium")
      const file = await createTestFile(testInfo, "cancelled.bin", GIB)
      const canceller = side === "sender" ? sender : receiver
      const other = side === "sender" ? receiver : sender

      await sendFile(sender, file.filePath)
      await acceptFile(receiver)
      await waitForProgress(receiver, 1)
      await canceller.page.getByRole("button", { name: `Cancel ${file.name}` }).click()

      await expect(canceller.page.getByText("You cancelled this file")).toBeVisible()
      await expect(other.page.getByText("They cancelled this file")).toBeVisible()
    })
  }

  test("leaving the chat fails the transfer clearly and removes the partial file", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, browserName as EngineName, "chromium")
    const file = await createTestFile(testInfo, "abandoned.bin", GIB)

    await sendFile(sender, file.filePath)
    await acceptFile(receiver)
    await waitForProgress(receiver, 1)

    await receiver.page.getByRole("button").first().click()
    await expect(receiver.page).toHaveURL(`${BASE_URL}/`)
    await expect(sender.page.getByText(/left the chat$/).first()).toBeVisible({ timeout: 40000 })
    await expect(sender.page.getByRole("button", { name: `Cancel ${file.name}` })).toHaveCount(0)
    await expect(sender.page.getByText("They left the chat")).toBeVisible()

    await expect.poll(() => receiver.page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const transfers = await root.getDirectoryHandle("quickdrop-transfers", { create: true })
      const names: string[] = []
      for await (const name of (transfers as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name)
      return names.length
    }), { timeout: 10000 }).toBe(0)
  })

  test("a file left behind by a closed tab is cleaned up on the next visit", async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Covers shared browser storage logic")
    const network = uniqueNetwork()
    const device = track(await createDevice(playwright, "chromium", "Sweep", testInfo, { network }))

    const leftBehind = () => device.page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const transfers = await root.getDirectoryHandle("quickdrop-transfers", { create: true })
      const folder = await transfers.getDirectoryHandle("abandoned-id", { create: true })
      await folder.getFileHandle("partial.bin", { create: true })
    })
    await leftBehind()

    await device.page.reload()
    await expect.poll(() => device.page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const transfers = await root.getDirectoryHandle("quickdrop-transfers", { create: true })
      const names: string[] = []
      for await (const name of (transfers as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name)
      return names
    })).toEqual([])
  })

  test("saves directly to a chosen file where the browser allows it", async ({ playwright }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Only Chromium has a save dialog")
    const { sender, receiver } = await pair(playwright, testInfo, "chromium", "chromium", {}, {
      keepSavePicker: true,
      // Stands in for the native dialog, which tests can't operate.
      initScript: () => {
        (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = async ({ suggestedName }: { suggestedName: string }) => {
          const root = await navigator.storage.getDirectory()
          return root.getFileHandle(`picked-${suggestedName}`, { create: true })
        }
      },
    })
    const file = await createTestFile(testInfo, "picked.bin", 150 * MIB)

    await sendFile(sender, file.filePath)
    await acceptFile(receiver)

    await expect(receiver.page.getByText("Saved to your device")).toBeVisible({ timeout: 120000 })
    await expect(receiver.page.getByRole("button", { name: `Download ${file.name}` })).toHaveCount(0)

    const size = await receiver.page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory()
      return (await (await root.getFileHandle(name)).getFile()).size
    }, `picked-${file.name}`)
    expect(size).toBe(150 * MIB)
  })

  test("a private window still receives small files", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, "chromium", browserName as EngineName, {}, { privateWindow: true })
    const file = await createTestFile(testInfo, "private-small.bin", 5 * MIB)

    await sendFile(sender, file.filePath)
    await expectDownloadMatches(receiver, file)
  })

  test("a private window explains why it can't take a very large file", async ({ browserName, playwright }, testInfo) => {
    const { sender, receiver } = await pair(playwright, testInfo, "chromium", browserName as EngineName, {}, { privateWindow: true })
    const file = await createTestFile(testInfo, "private-large.bin", 2 * GIB)

    await sendFile(sender, file.filePath)
    await acceptFile(receiver)

    await expect(receiver.page.getByText(/private window/i)).toBeVisible({ timeout: 120000 })
    await expect(sender.page.getByText(/(space on their device|couldn't save this file)/i)).toBeVisible()
  })
})
