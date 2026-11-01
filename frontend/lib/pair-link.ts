// The token stays in the URL fragment, which browsers never send to a server,
// so it can't end up in the access logs of a host or proxy.
const FRAGMENT_PATTERN = /^#pair=([\w-]+)$/

export function buildPairLink(origin: string, token: string): string {
  return `${origin}/#pair=${token}`
}

export function readPairToken(hash: string): string | null {
  return hash.match(FRAGMENT_PATTERN)?.[1] ?? null
}

export function formatCountdown(remainingSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(remainingSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
