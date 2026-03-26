const adjectives = [
  "Swift", "Bold", "Calm", "Vivid", "Brave", "Bright", "Sharp",
  "Quiet", "Warm", "Cool", "Witty", "Noble", "Lucky", "Sleek",
  "Rapid", "Agile", "Keen", "Lively", "Steady", "Nimble"
];

const animals = [
  "Falcon", "Panda", "Otter", "Tiger", "Raven", "Dolphin", "Fox",
  "Wolf", "Eagle", "Koala", "Lynx", "Hawk", "Bear", "Owl",
  "Jaguar", "Heron", "Crane", "Bison", "Stag", "Cobra"
];

const STORAGE_KEY = "quickdrop_device_name";

function generateRandomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}

function getOSLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  return "Device";
}

/**
 * Returns a stable device name, persisted in localStorage.
 * Same name is returned across all calls in this browser tab/session.
 */
export function getDeviceName(): string {
  if (typeof window === "undefined") return "Unknown Device";

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  const os = getOSLabel();
  const name = `${generateRandomName()}'s ${os}`;
  localStorage.setItem(STORAGE_KEY, name);
  return name;
}

export function setDeviceName(newName: string): string {
  if (typeof window === "undefined") return "Unknown Device";
  const trimmed = newName.trim();
  if (!trimmed) {
    const os = getOSLabel();
    const generated = `${generateRandomName()}'s ${os}`;
    localStorage.setItem(STORAGE_KEY, generated);
    return generated;
  }
  localStorage.setItem(STORAGE_KEY, trimmed);
  return trimmed;
}
export function getDeviceType(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("iPhone") || ua.includes("Android") && ua.includes("Mobile")) return "mobile";
  if (ua.includes("iPad") || ua.includes("Android") && !ua.includes("Mobile")) return "tablet";
  if (ua.includes("Mac") || ua.includes("Windows") || ua.includes("Linux")) return "desktop";
  return "unknown";
}
