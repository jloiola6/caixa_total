const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const isDev = process.env.NODE_ENV !== "production";
const outDir = path.join(__dirname, "..", "out");
const outIndex = path.join(outDir, "index.html");
const desktopUpdateConfigPath = path.join(__dirname, "..", "desktop-update-config.json");
const fsPromises = fs.promises;
const normalizeDesktopApiBaseUrl = (url) =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
const desktopApiUrlRaw =
  process.env.DESKTOP_API_URL ||
  "http://localhost:4000";
const desktopApiBaseUrl = normalizeDesktopApiBaseUrl(
  desktopApiUrlRaw,
);
const apiPrefix = "/api";
const debugRoute = "/__desktop_debug";
const isDesktopDebug = process.env.DESKTOP_DEBUG === "1";
const desktopServerPort = Number(process.env.DESKTOP_SERVER_PORT ?? 0);
const preferredPrinterName = (process.env.DESKTOP_PRINTER_NAME || "").trim();
const updateCheckDelayMs = 10000;

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
}

let staticServer = null;
let staticServerUrl = null;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function fileExists(filePath) {
  try {
    const stat = await fsPromises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || "application/octet-stream";
}

function debugLog(message) {
  if (!isDesktopDebug) return;
  console.log(`[desktop-debug] ${message}`);
}

function errorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function readDesktopUpdateConfig() {
  try {
    if (!fs.existsSync(desktopUpdateConfigPath)) return { latestUrl: "" };
    const raw = fs.readFileSync(desktopUpdateConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      latestUrl: typeof parsed.latestUrl === "string" ? parsed.latestUrl.trim() : "",
    };
  } catch (error) {
    debugLog(`Falha ao ler config de update: ${errorMessage(error, "erro desconhecido")}`);
    return { latestUrl: "" };
  }
}

function compareSemver(a, b) {
  const parse = (value) =>
    String(value || "")
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length, 3);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] || 0;
    const rightPart = right[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

async function checkForDesktopUpdate(mainWindow) {
  if (isDev) return;

  const { latestUrl } = readDesktopUpdateConfig();
  if (!latestUrl) {
    debugLog("Update desktop sem latestUrl configurado");
    return;
  }

  try {
    const response = await fetch(`${latestUrl}?t=${Date.now()}`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      debugLog(`Update desktop retornou HTTP ${response.status}`);
      return;
    }

    const latest = await response.json();
    const latestVersion = typeof latest.version === "string" ? latest.version.trim() : "";
    const installerUrl =
      typeof latest.installerUrl === "string" ? latest.installerUrl.trim() : "";
    if (!latestVersion || !installerUrl) return;
    if (compareSemver(latestVersion, app.getVersion()) <= 0) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Baixar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
      title: "Atualizacao disponivel",
      message: `Caixa Total ${latestVersion} esta disponivel`,
      detail:
        "Baixe e instale a nova versao para receber as melhorias mais recentes do aplicativo desktop.",
    });

    if (result.response === 0) {
      await shell.openExternal(installerUrl);
    }
  } catch (error) {
    debugLog(`Falha ao verificar update desktop: ${errorMessage(error, "erro desconhecido")}`);
  }
}

function runExecFile(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        const details = [stderr, stdout].filter(Boolean).join(" ").trim();
        reject(
          new Error(details || error.message || `Falha ao executar comando: ${command}`),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function htmlToPlainText(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .filter((line, index, arr) => {
      if (line.trim() !== "") return true;
      const prev = arr[index - 1];
      return prev && prev.trim() !== "";
    })
    .join("\n")
    .trim();
}

function parsePrinterNamesFromLpstat(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("printer "))
    .map((line) => line.split(/\s+/)[1])
    .filter(Boolean);
}

function parseDefaultPrinterFromLpstat(output) {
  const match = output.match(/destination:\s*([^\s]+)/i);
  return match ? match[1] : "";
}

function normalizePrintOptions(rawOptions) {
  if (!rawOptions || typeof rawOptions !== "object") {
    return {
      connectionType: "local",
      localPrinterName: "",
      wifiHost: "",
      wifiPort: 9100,
      cutAfterPrint: true,
    };
  }

  const options = rawOptions;
  const connectionType = options.connectionType === "wifi" ? "wifi" : "local";
  const localPrinterName =
    typeof options.localPrinterName === "string" ? options.localPrinterName.trim() : "";
  const wifiHost = typeof options.wifiHost === "string" ? options.wifiHost.trim() : "";
  const wifiPort =
    typeof options.wifiPort === "number" && Number.isFinite(options.wifiPort)
      ? Math.max(1, Math.floor(options.wifiPort))
      : 9100;
  const cutAfterPrint = options.cutAfterPrint !== false;

  return { connectionType, localPrinterName, wifiHost, wifiPort, cutAfterPrint };
}

async function listLocalPrinters() {
  try {
    const printersOut = await runExecFile("lpstat", ["-p"]);
    let defaultName = "";
    try {
      const defaultOut = await runExecFile("lpstat", ["-d"]);
      defaultName = parseDefaultPrinterFromLpstat(defaultOut.stdout || "");
    } catch {
      defaultName = "";
    }

    const names = parsePrinterNamesFromLpstat(printersOut.stdout || "");
    return {
      ok: true,
      printers: names.map((name) => ({ name, isDefault: name === defaultName })),
    };
  } catch (error) {
    return {
      ok: false,
      printers: [],
      error: errorMessage(error, "Falha ao listar impressoras locais"),
    };
  }
}

function appendCutCommand(payload) {
  return Buffer.concat([
    payload,
    Buffer.from("\r\n\r\n\r\n", "utf8"),
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
}

function buildPrintPayload(text, cutAfterPrint) {
  const normalizedText = text.replace(/\r?\n/g, "\r\n");
  const basePayload = Buffer.from(normalizedText, "utf8");
  return cutAfterPrint ? appendCutCommand(basePayload) : basePayload;
}

async function printTextOverWifi(payload, host, port) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finishOk = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok: true });
    };

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    socket.setTimeout(8000);
    socket.once("timeout", () => finishError(new Error("Timeout na impressora Wi-Fi")));
    socket.once("error", (error) => finishError(error));
    socket.connect(port, host, () => {
      socket.write(payload, (writeError) => {
        if (writeError) {
          finishError(writeError);
          return;
        }
        socket.end();
      });
    });
    socket.once("close", () => finishOk());
  });
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getBackendHealthDebug() {
  try {
    const healthUrl = `${desktopApiBaseUrl}/health`;
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    const responseText = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      bodyPreview: responseText.slice(0, 300),
      bodyJson: tryParseJson(responseText),
      target: healthUrl,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      target: `${desktopApiBaseUrl}/health`,
    };
  }
}

function safeResolveFromOut(relativePath) {
  const normalizedPath = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, "");
  const resolvedPath = path.resolve(outDir, normalizedPath);
  const relativeToOut = path.relative(outDir, resolvedPath);
  if (relativeToOut.startsWith("..") || path.isAbsolute(relativeToOut)) {
    return null;
  }
  return resolvedPath;
}

async function resolveStaticPath(requestPathname) {
  const cleanPath = decodeURIComponent((requestPathname || "/").split("?")[0]);
  const normalized = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const basePath = safeResolveFromOut(normalized);

  const candidates = [];
  if (basePath) candidates.push(basePath);
  if (basePath && !path.extname(basePath)) {
    candidates.push(`${basePath}.html`);
    candidates.push(path.join(basePath, "index.html"));
  }
  candidates.push(outIndex);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function startStaticServer() {
  if (staticServerUrl) return staticServerUrl;

  staticServer = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname === debugRoute) {
        const health = await getBackendHealthDebug();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify(
            {
              isDev,
              isDesktopDebug,
              desktopApiUrlRaw,
              desktopApiBaseUrl,
              normalizedFromRaw: desktopApiUrlRaw !== desktopApiBaseUrl,
              localServerUrl: staticServerUrl,
              health,
              now: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
        return;
      }

      if (
        requestUrl.pathname === apiPrefix ||
        requestUrl.pathname.startsWith(`${apiPrefix}/`)
      ) {
        await proxyApiRequest(req, res, requestUrl);
        return;
      }

      const filePath = await resolveStaticPath(req.url || "/");
      if (!filePath) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      const fileData = await fsPromises.readFile(filePath);
      res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      res.end(fileData);
    } catch (error) {
      console.error("Erro ao servir arquivo estático:", error);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
    }
  });

  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(desktopServerPort, "127.0.0.1", () => resolve());
  });

  const { port } = staticServer.address();
  staticServerUrl = `http://127.0.0.1:${port}`;
  debugLog(`Servidor local iniciado em ${staticServerUrl}`);
  return staticServerUrl;
}

async function proxyApiRequest(req, res, requestUrl) {
  try {
    const targetPath = requestUrl.pathname.slice(apiPrefix.length) || "/";
    const targetUrl = `${desktopApiBaseUrl}${targetPath}${requestUrl.search}`;
    const method = req.method || "GET";
    debugLog(`${method} ${requestUrl.pathname}${requestUrl.search} -> ${targetUrl}`);

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "host" ||
        lowerKey === "connection" ||
        lowerKey === "content-length" ||
        lowerKey === "origin" ||
        lowerKey === "referer" ||
        lowerKey.startsWith("sec-fetch-") ||
        lowerKey.startsWith("sec-ch-ua") ||
        lowerKey === "access-control-request-method" ||
        lowerKey === "access-control-request-headers"
      ) {
        continue;
      }
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    let body;
    if (method !== "GET" && method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    }

    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    const responseHeaders = {};
    upstreamResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "connection" || lowerKey === "transfer-encoding") return;
      responseHeaders[key] = value;
    });

    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    const responseContentType = upstreamResponse.headers.get("content-type") ?? "";
    debugLog(`${method} ${requestUrl.pathname} <= ${upstreamResponse.status} ${responseContentType}`);
    if (isDesktopDebug && upstreamResponse.status >= 400) {
      const bodyPreview = responseBody.toString("utf8").slice(0, 250).replace(/\s+/g, " ");
      debugLog(`Resposta de erro (preview): ${bodyPreview}`);
    }
    res.writeHead(upstreamResponse.status, responseHeaders);
    res.end(responseBody);
  } catch (error) {
    console.error("Falha no proxy para o backend:", error);
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Falha ao acessar o backend" }));
  }
}

async function printTextSilently(text, rawOptions) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "Texto de comprovante invalido" };
  }

  const options = normalizePrintOptions(rawOptions);
  const payload = buildPrintPayload(text, options.cutAfterPrint);

  if (options.connectionType === "wifi") {
    if (!options.wifiHost) {
      return { ok: false, error: "Informe o IP/host da impressora Wi-Fi" };
    }
    try {
      await printTextOverWifi(payload, options.wifiHost, options.wifiPort);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: errorMessage(error, "Falha ao imprimir na impressora Wi-Fi"),
      };
    }
  }

  let tempDir = "";
  try {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "caixatotal-print-"));
    const filePath = path.join(tempDir, "comprovante.txt");
    await fsPromises.writeFile(filePath, payload);

    let printerName = options.localPrinterName || preferredPrinterName;
    if (!printerName) {
      try {
        const defaultOut = await runExecFile("lpstat", ["-d"]);
        printerName = parseDefaultPrinterFromLpstat(defaultOut.stdout || "");
      } catch {
        printerName = "";
      }
    }
    if (!printerName) {
      return {
        ok: false,
        error: "Nenhuma impressora local selecionada. Configure em Configuracoes > Impressora.",
      };
    }

    const args = [];
    args.push("-d", printerName);
    args.push("-o", "raw", filePath);

    await runExecFile("lp", args);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, "Falha ao imprimir comprovante em texto"),
    };
  } finally {
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

ipcMain.handle("desktop:print-text-silent", async (_event, text, options) => {
  return printTextSilently(text, options);
});

// Compatibilidade com chamadas antigas: converte HTML para texto e imprime em raw text.
ipcMain.handle("desktop:print-html-silent", async (_event, html, options) => {
  if (typeof html !== "string" || html.trim() === "") {
    return { ok: false, error: "Conteudo de impressao invalido" };
  }
  const plainText = htmlToPlainText(html);
  return printTextSilently(plainText, options);
});

ipcMain.handle("desktop:list-printers", async () => {
  return listLocalPrinters();
});

async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false,
    },
  });

  const loadUrl = isDev
    ? "http://localhost:3000"
    : await startStaticServer();

  await mainWindow.loadURL(loadUrl);

  if (isDev || isDesktopDebug) {
    mainWindow.webContents.openDevTools();
  }

  if (!isDev) {
    setTimeout(() => {
      checkForDesktopUpdate(mainWindow).catch((error) => {
        debugLog(`Erro inesperado no update desktop: ${errorMessage(error, "erro desconhecido")}`);
      });
    }, updateCheckDelayMs);
  }
}

app.whenReady().then(async () => {
  if (!isDev && !fs.existsSync(outIndex)) {
    console.error("Build estático não encontrado. Execute `pnpm build:static:desktop` antes de abrir o desktop.");
    app.quit();
    return;
  }

  if (!isDev) {
    console.log(`Desktop API URL: ${desktopApiBaseUrl}`);
    if (isDesktopDebug) {
      debugLog(`DESKTOP_API_URL (raw): ${desktopApiUrlRaw}`);
      debugLog(`DESKTOP_API_URL (normalizada): ${desktopApiBaseUrl}`);
      const healthDebug = await getBackendHealthDebug();
      debugLog(`Health check inicial: ${JSON.stringify(healthDebug)}`);
    }
  }

  try {
    await createWindow();
    if (!isDev && isDesktopDebug && staticServerUrl) {
      debugLog(`Diagnóstico local: ${staticServerUrl}${debugRoute}`);
    }
  } catch (error) {
    console.error("Falha ao iniciar o app desktop:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error("Falha ao abrir nova janela:", error);
    });
  }
});

app.on("before-quit", () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
    staticServerUrl = null;
  }
});
