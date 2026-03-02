import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { syncRouter } from "./routes/sync.js";
import { reportRouter } from "./routes/report.js";

const app = express();
const port = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/health", healthRouter);
app.use("/sync", syncRouter);
app.use("/report", reportRouter);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
