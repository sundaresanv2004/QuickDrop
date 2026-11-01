// Used only by the storage tests on the health page. Its scope is limited to
// /__diagnostics/, so it never handles the rest of QuickDrop.

const FILE_PATH = "/__diagnostics/file/"
const TEST_DIRECTORY = "quickdrop-diagnostics"
const VALID_NAME = /^quickdrop-test-\d+gib\.bin$/

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

async function streamTestFile(event, name) {
  const root = await navigator.storage.getDirectory()
  const directory = await root.getDirectoryHandle(TEST_DIRECTORY)
  const handle = await directory.getFileHandle(name)
  const file = await handle.getFile()

  // Keep the worker alive until the whole file has been passed to the browser.
  const { readable, writable } = new TransformStream()
  event.waitUntil(file.stream().pipeTo(writable))

  return new Response(readable, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  })
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (!url.pathname.startsWith(FILE_PATH)) return

  const name = decodeURIComponent(url.pathname.slice(FILE_PATH.length))
  if (!VALID_NAME.test(name)) {
    event.respondWith(new Response("Not found", { status: 404 }))
    return
  }

  event.respondWith(
    streamTestFile(event, name).catch(() => new Response("Test file not found", { status: 404 }))
  )
})
