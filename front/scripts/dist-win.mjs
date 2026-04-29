import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runCommand } from "./run-command.mjs"
import { resolveDesktopApiBaseUrl } from "./desktop-runtime-config.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const desktopApiBaseUrl = resolveDesktopApiBaseUrl()

if (!desktopApiBaseUrl) {
  throw new Error(
    "DESKTOP_API_URL e obrigatorio para gerar a build Windows. Exemplo: DESKTOP_API_URL=https://seu-backend.run.app pnpm dist:win",
  )
}

await runCommand("pnpm", ["build:static:desktop"], {
  cwd: rootDir,
})

await runCommand("pnpm", ["exec", "electron-builder", "--win", "nsis", "--x64"], {
  cwd: rootDir,
  env: {
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
})

await runCommand("node", ["scripts/copy-windows-installer.mjs"], {
  cwd: rootDir,
})
