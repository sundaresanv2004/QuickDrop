import { getTestFile } from "./storage-test"

export type SaveMethod = "blob-url" | "service-worker" | "web-share"

export const SAVE_METHOD_LABELS: Record<SaveMethod, string> = {
  "blob-url": "Download link",
  "service-worker": "Service Worker stream",
  "web-share": "Share sheet",
}

const SERVICE_WORKER_URL = "/diagnostics-sw.js"
const SERVICE_WORKER_SCOPE = "/__diagnostics/"
const BLOB_URL_LIFETIME_MS = 10 * 60 * 1000

function clickDownloadLink(href: string, fileName: string) {
  const link = document.createElement("a")
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// A link with the download attribute can skip the Service Worker when the page
// isn't under its scope. Navigating a frame into the scope goes through it.
function navigateHiddenFrame(href: string) {
  const frame = document.createElement("iframe")
  frame.hidden = true
  frame.src = href
  document.body.appendChild(frame)
  setTimeout(() => frame.remove(), BLOB_URL_LIFETIME_MS)
}

async function activateServiceWorker() {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
  const worker = registration.active ?? registration.waiting ?? registration.installing
  if (!worker || worker.state === "activated") return

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Service Worker did not activate")), 10000)
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

export function canUseServiceWorker() {
  return "serviceWorker" in navigator
}

export function canUseShare(file: File) {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })
}

// Browsers don't report whether a download finished, so the person running the
// test confirms that and can then verify the saved file's contents.
export async function saveTestFile(method: SaveMethod, fileName: string) {
  switch (method) {
    case "blob-url": {
      const url = URL.createObjectURL(await getTestFile(fileName))
      clickDownloadLink(url, fileName)
      setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS)
      return
    }
    case "service-worker":
      await activateServiceWorker()
      navigateHiddenFrame(`${SERVICE_WORKER_SCOPE}file/${encodeURIComponent(fileName)}`)
      return
    case "web-share": {
      const file = await getTestFile(fileName)
      if (!canUseShare(file)) throw new Error("This browser cannot share this file")
      await navigator.share({ files: [file] })
      return
    }
  }
}
