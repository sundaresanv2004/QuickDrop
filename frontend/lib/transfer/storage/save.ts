const DOWNLOAD_URL_LIFETIME_MS = 10 * 60 * 1000

export function canPickSaveLocation() {
  return typeof window !== "undefined" && "showSaveFilePicker" in window
}

export async function pickSaveLocation(suggestedName: string): Promise<FileSystemFileHandle> {
  const picker = (window as unknown as {
    showSaveFilePicker: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>
  }).showSaveFilePicker
  return picker({ suggestedName })
}

// A generic type keeps the browser from opening a file from another device on
// this site. It would otherwise run as part of this page if it contained a web page.
export function downloadFile(file: File, name: string) {
  const blob = new Blob([file], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Saving a large file takes a while, so the address has to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS)
}

function shareableFile(file: File, name: string, mimeType: string) {
  // The share sheet only offers "Save to Photos" for a real image or video type.
  const type = /^(image|video)\//.test(mimeType) ? mimeType : "application/octet-stream"
  return new File([file], name, { type })
}

export function canShareFile(file: File, name: string, mimeType: string) {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [shareableFile(file, name, mimeType)] })
}

export async function shareFile(file: File, name: string, mimeType: string) {
  await navigator.share({ files: [shareableFile(file, name, mimeType)] })
}
