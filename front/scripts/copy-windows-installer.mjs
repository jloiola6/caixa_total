import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveDesktopUpdateBaseUrl, writeDesktopUpdateConfig } from "./desktop-update-config.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const installerFileName = "caixa-total-windows-x64.exe"
const sourcePath = join(rootDir, "dist-desktop", installerFileName)
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))
const publicBaseUrl = resolveDesktopUpdateBaseUrl()
const installerUrl = publicBaseUrl
  ? `${publicBaseUrl}/downloads/${installerFileName}`
  : `/downloads/${installerFileName}`
const latestMetadata = {
  version: packageJson.version,
  installerUrl,
  releaseDate: new Date().toISOString(),
  notes: "Nova versao do Caixa Total Desktop disponivel.",
}
const targets = [
  join(rootDir, "public", "downloads", installerFileName),
  join(rootDir, "out", "downloads", installerFileName),
]
const metadataTargets = [
  join(rootDir, "public", "desktop", "latest.json"),
  join(rootDir, "out", "desktop", "latest.json"),
]

if (!existsSync(sourcePath)) {
  throw new Error(`Instalador nao encontrado em ${sourcePath}`)
}

writeDesktopUpdateConfig(rootDir)

for (const targetPath of targets) {
  mkdirSync(dirname(targetPath), { recursive: true })
  copyFileSync(sourcePath, targetPath)
  console.log(`Instalador copiado para ${targetPath}`)
}

for (const targetPath of metadataTargets) {
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, `${JSON.stringify(latestMetadata, null, 2)}\n`)
  console.log(`Metadata de update copiada para ${targetPath}`)
}
