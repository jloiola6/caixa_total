import { Router } from "express";
import { prisma } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch (e) {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});
