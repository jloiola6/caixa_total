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

const app = express();

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
app.use(express.json({ limit: "10mb" }));

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/sync", syncRouter);
app.use("/report", reportRouter);
app.use("/notifications", notificationsRouter);
app.use("/finance", financeRouter);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${config.port}`);
});
