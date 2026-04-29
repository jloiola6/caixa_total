import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runCommand } from "./run-command.mjs"
import { writeDesktopUpdateConfig } from "./desktop-update-config.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

writeDesktopUpdateConfig(rootDir)

await runCommand("pnpm", ["exec", "next", "build"], {
  cwd: rootDir,
  env: {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_URL: "/api",
  },
})
