import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runCommand } from "./run-command.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const bucket = (process.env.GCS_DESKTOP_BUCKET || "").trim()
const prefix = (process.env.GCS_DESKTOP_PREFIX || "").trim().replace(/^\/+|\/+$/g, "")
const installerFileName = "caixa-total-windows-x64.exe"

if (!bucket) {
  throw new Error("Defina GCS_DESKTOP_BUCKET com o nome do bucket.")
}

const bucketBase = prefix ? `gs://${bucket}/${prefix}` : `gs://${bucket}`
const files = [
  {
    source: join(rootDir, "dist-desktop", installerFileName),
    target: `${bucketBase}/downloads/${installerFileName}`,
    contentType: "application/vnd.microsoft.portable-executable",
  },
  {
    source: join(rootDir, "public", "desktop", "latest.json"),
    target: `${bucketBase}/desktop/latest.json`,
    contentType: "application/json",
  },
]

for (const file of files) {
  if (!existsSync(file.source)) {
    throw new Error(`Arquivo nao encontrado: ${file.source}`)
  }

  await runCommand("gcloud", [
    "storage",
    "cp",
    file.source,
    file.target,
    "--cache-control=no-cache",
    `--content-type=${file.contentType}`,
  ])
}

console.log(`Arquivos publicados em ${bucketBase}`)
