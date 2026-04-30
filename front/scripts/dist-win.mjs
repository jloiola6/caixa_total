import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runCommand } from "./run-command.mjs"
import { resolveDesktopApiBaseUrl } from "./desktop-runtime-config.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const desktopApiBaseUrl = resolveDesktopApiBaseUrl()
const electronBuilderArgs = [
  "exec",
  "electron-builder",
  "--win",
  "nsis",
  "--x64",
  "--publish",
  "never",
]

async function runElectronBuilderWithRetry() {
  const maxAttempts = Number(process.env.ELECTRON_BUILDER_RETRIES ?? 3)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runCommand("pnpm", electronBuilderArgs, {
        cwd: rootDir,
        env: {
          CSC_IDENTITY_AUTO_DISCOVERY: "false",
        },
      })
      return
    } catch (error) {
      if (attempt >= maxAttempts) throw error

      const delayMs = attempt * 15000
      console.warn(
        `electron-builder falhou na tentativa ${attempt}/${maxAttempts}. Tentando novamente em ${delayMs / 1000}s...`,
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

if (!desktopApiBaseUrl) {
  throw new Error(
    "DESKTOP_API_URL e obrigatorio para gerar a build Windows. Exemplo: DESKTOP_API_URL=https://seu-backend.run.app pnpm dist:win",
  )
}

await runCommand("pnpm", ["build:static:desktop"], {
  cwd: rootDir,
})

await runElectronBuilderWithRetry()

await runCommand("node", ["scripts/copy-windows-installer.mjs"], {
  cwd: rootDir,
})
