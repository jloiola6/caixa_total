import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { syncRouter } from "./routes/sync.js";
import { reportRouter } from "./routes/report.js";
import { notificationsRouter } from "./routes/notifications.js";
import { financeRouter } from "./routes/finance.js";
import { storefrontRouter } from "./routes/storefront.js";
import { uploadsRouter } from "./routes/uploads.js";

const app = express();
const JSON_BODY_LIMIT = "50mb";

const allowedOrigins = config.frontUrl
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Requisições sem origin (Electron, curl, mobile) ou origin na allowlist
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Bloqueado pelo CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/sync", syncRouter);
app.use("/report", reportRouter);
app.use("/notifications", notificationsRouter);
app.use("/finance", financeRouter);
app.use("/storefront", storefrontRouter);
app.use("/uploads", uploadsRouter);

app.use(((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({
      error: `Payload muito grande para a API. Reduza o volume de dados ou imagens antes de sincronizar (limite atual: ${JSON_BODY_LIMIT}).`,
    });
    return;
  }

  next(error);
}) as express.ErrorRequestHandler);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${config.port}`);
});
