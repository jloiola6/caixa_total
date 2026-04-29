import { writeFileSync } from "node:fs"
import { join } from "node:path"

function normalizeBaseUrl(value) {
  if (!value) return ""
  return String(value).trim().replace(/\/+$/, "")
}

export function resolveDesktopUpdateBaseUrl() {
  return normalizeBaseUrl(
    process.env.DESKTOP_UPDATE_BASE_URL ||
      process.env.NEXT_PUBLIC_DESKTOP_INSTALLER_URL?.replace(/\/downloads\/caixa-total-windows-x64\.exe$/i, ""),
  )
}

export function writeDesktopUpdateConfig(rootDir) {
  const publicBaseUrl = resolveDesktopUpdateBaseUrl()
  const config = {
    publicBaseUrl,
    latestUrl: publicBaseUrl ? `${publicBaseUrl}/desktop/latest.json` : "",
  }

  writeFileSync(
    join(rootDir, "desktop-update-config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}
