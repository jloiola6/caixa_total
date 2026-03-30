const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const isDev = process.env.NODE_ENV !== "production";
const outDir = path.join(__dirname, "..", "out");
const outIndex = path.join(outDir, "index.html");
const fsPromises = fs.promises;
const normalizeDesktopApiBaseUrl = (url) =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
const desktopApiUrlRaw =
  process.env.DESKTOP_API_URL ||
  "https://caixa-total-back-3941173426.us-central1.run.app";
const desktopApiBaseUrl = normalizeDesktopApiBaseUrl(
  desktopApiUrlRaw,
);
const apiPrefix = "/api";
const debugRoute = "/__desktop_debug";
const isDesktopDebug = process.env.DESKTOP_DEBUG === "1";
const desktopServerPort = Number(process.env.DESKTOP_SERVER_PORT ?? 0);

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

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const loadUrl = isDev
    ? "http://localhost:3000"
    : await startStaticServer();

  await mainWindow.loadURL(loadUrl);

  if (isDev || isDesktopDebug) {
    mainWindow.webContents.openDevTools();
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
