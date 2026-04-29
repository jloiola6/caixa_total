import { writeFileSync } from "node:fs"
import { join } from "node:path"

export function normalizeDesktopApiBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "")
}

export function resolveDesktopApiBaseUrl() {
  return normalizeDesktopApiBaseUrl(process.env.DESKTOP_API_URL)
}

export function writeDesktopRuntimeConfig(rootDir) {
  const apiBaseUrl = resolveDesktopApiBaseUrl()
  const config = {
    apiBaseUrl,
  }

  writeFileSync(
    join(rootDir, "desktop-runtime-config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}
