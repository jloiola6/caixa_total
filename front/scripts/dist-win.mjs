import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runCommand } from "./run-command.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

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
