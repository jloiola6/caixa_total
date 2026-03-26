import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { config } from "../config.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Token ausente" });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      email: string;
      role: UserRole;
      storeId: string | null;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (req.user.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Acesso negado. Apenas super admin." });
    return;
  }
  next();
}

export function requireStoreUserOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "STORE_USER") {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }
  next();
}
