import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/auth.js";

const SALT_ROUNDS = 10;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_STOCK_ALERT_LOW_COLOR = "#f59e0b";
const DEFAULT_STOCK_ALERT_OUT_COLOR = "#ef4444";
const DEFAULT_STOCK_ALERT_OK_COLOR = "#22c55e";
const DEFAULT_STOCK_ALERT_LOW_THRESHOLD = 5;
const DEFAULT_STOCK_ALERT_AVAILABLE_THRESHOLD = 6;

function normalizeOptionalWhatsappNumber(value: string | null | undefined): string | null {
  if (value == null) return null;
  const digitsOnly = value.replace(/[^\d]/g, "");
  return digitsOnly.length > 0 ? digitsOnly : null;
}

function normalizeOptionalMessage(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStockAlertColor(value: string | undefined, fallback: string): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return fallback;
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function normalizeStockAlertThreshold(value: number | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized < 0 || normalized > 1000000) return null;
  return normalized;
}

export const adminRouter = Router();

adminRouter.use(authMiddleware);
adminRouter.use(requireSuperAdmin);

adminRouter.get("/stores", async (_req, res) => {
  try {
    const stores = await prisma.store.findMany({
      orderBy: { name: "asc" },
    });
    res.status(200).json(stores);
  } catch (e) {
    console.error("Admin list stores error:", e);
    res.status(500).json({ error: "Erro ao listar lojas" });
  }
});

adminRouter.post("/stores", async (req, res) => {
  try {
    const {
      name,
      slug,
      offlineModeEnabled,
      onlineStoreEnabled,
      financeModuleEnabled,
      onlineStoreWhatsappNumber,
      onlineStoreWhatsappMessage,
      stockAlertLowColor,
      stockAlertOutColor,
      stockAlertOkColor,
      stockAlertLowThreshold,
      stockAlertAvailableThreshold,
    } = req.body as {
      name?: string;
      slug?: string;
      offlineModeEnabled?: boolean;
      onlineStoreEnabled?: boolean;
      financeModuleEnabled?: boolean;
      onlineStoreWhatsappNumber?: string | null;
      onlineStoreWhatsappMessage?: string | null;
      stockAlertLowColor?: string;
      stockAlertOutColor?: string;
      stockAlertOkColor?: string;
      stockAlertLowThreshold?: number;
      stockAlertAvailableThreshold?: number;
    };
    if (!name?.trim() || !slug?.trim()) {
      res.status(400).json({ error: "Nome e slug são obrigatórios" });
      return;
    }
    if (
      onlineStoreWhatsappNumber !== undefined &&
      onlineStoreWhatsappNumber !== null &&
      typeof onlineStoreWhatsappNumber !== "string"
    ) {
      res.status(400).json({ error: "Número de WhatsApp inválido" });
      return;
    }
    if (
      onlineStoreWhatsappMessage !== undefined &&
      onlineStoreWhatsappMessage !== null &&
      typeof onlineStoreWhatsappMessage !== "string"
    ) {
      res.status(400).json({ error: "Mensagem padrão inválida" });
      return;
    }
    if (stockAlertLowColor !== undefined && typeof stockAlertLowColor !== "string") {
      res.status(400).json({ error: "Cor de alerta de estoque baixo inválida" });
      return;
    }
    if (stockAlertOutColor !== undefined && typeof stockAlertOutColor !== "string") {
      res.status(400).json({ error: "Cor de alerta sem estoque inválida" });
      return;
    }
    if (stockAlertOkColor !== undefined && typeof stockAlertOkColor !== "string") {
      res.status(400).json({ error: "Cor de alerta de estoque disponível inválida" });
      return;
    }
    if (stockAlertLowThreshold !== undefined && typeof stockAlertLowThreshold !== "number") {
      res.status(400).json({ error: "Valor de estoque baixo inválido" });
      return;
    }
    if (
      stockAlertAvailableThreshold !== undefined &&
      typeof stockAlertAvailableThreshold !== "number"
    ) {
      res.status(400).json({ error: "Valor de estoque disponível inválido" });
      return;
    }

    const normalizedLowColor = normalizeStockAlertColor(
      stockAlertLowColor,
      DEFAULT_STOCK_ALERT_LOW_COLOR
    );
    const normalizedOutColor = normalizeStockAlertColor(
      stockAlertOutColor,
      DEFAULT_STOCK_ALERT_OUT_COLOR
    );
    const normalizedOkColor = normalizeStockAlertColor(
      stockAlertOkColor,
      DEFAULT_STOCK_ALERT_OK_COLOR
    );
    const normalizedLowThreshold = normalizeStockAlertThreshold(
      stockAlertLowThreshold,
      DEFAULT_STOCK_ALERT_LOW_THRESHOLD
    );
    const normalizedAvailableThreshold = normalizeStockAlertThreshold(
      stockAlertAvailableThreshold,
      DEFAULT_STOCK_ALERT_AVAILABLE_THRESHOLD
    );
    if (!normalizedLowColor || !normalizedOutColor || !normalizedOkColor) {
      res.status(400).json({ error: "Use cores no formato hexadecimal (#RRGGBB)" });
      return;
    }
    if (normalizedLowThreshold == null || normalizedAvailableThreshold == null) {
      res.status(400).json({ error: "Os limites de estoque devem ser números inteiros válidos" });
      return;
    }
    if (normalizedAvailableThreshold <= normalizedLowThreshold) {
      res.status(400).json({
        error: "O valor de estoque disponível deve ser maior que o estoque baixo",
      });
      return;
    }

    const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    const existing = await prisma.store.findUnique({ where: { slug: normalizedSlug } });
    if (existing) {
      res.status(400).json({ error: "Já existe uma loja com este slug" });
      return;
    }
    const store = await prisma.store.create({
      data: {
        name: name.trim(),
        slug: normalizedSlug,
        offlineModeEnabled:
          typeof offlineModeEnabled === "boolean" ? offlineModeEnabled : true,
        onlineStoreEnabled:
          typeof onlineStoreEnabled === "boolean" ? onlineStoreEnabled : false,
        financeModuleEnabled:
          typeof financeModuleEnabled === "boolean" ? financeModuleEnabled : true,
        onlineStoreWhatsappNumber: normalizeOptionalWhatsappNumber(onlineStoreWhatsappNumber),
        onlineStoreWhatsappMessage: normalizeOptionalMessage(onlineStoreWhatsappMessage),
        stockAlertLowColor: normalizedLowColor,
        stockAlertOutColor: normalizedOutColor,
        stockAlertOkColor: normalizedOkColor,
        stockAlertLowThreshold: normalizedLowThreshold,
        stockAlertAvailableThreshold: normalizedAvailableThreshold,
      },
    });
    res.status(201).json(store);
  } catch (e) {
    console.error("Admin create store error:", e);
    res.status(500).json({ error: "Erro ao criar loja" });
  }
});

adminRouter.patch("/stores/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      offlineModeEnabled,
      onlineStoreEnabled,
      financeModuleEnabled,
      onlineStoreWhatsappNumber,
      onlineStoreWhatsappMessage,
      stockAlertLowColor,
      stockAlertOutColor,
      stockAlertOkColor,
      stockAlertLowThreshold,
      stockAlertAvailableThreshold,
    } = req.body as {
      name?: string;
      slug?: string;
      offlineModeEnabled?: boolean;
      onlineStoreEnabled?: boolean;
      financeModuleEnabled?: boolean;
      onlineStoreWhatsappNumber?: string | null;
      onlineStoreWhatsappMessage?: string | null;
      stockAlertLowColor?: string;
      stockAlertOutColor?: string;
      stockAlertOkColor?: string;
      stockAlertLowThreshold?: number;
      stockAlertAvailableThreshold?: number;
    };
    const data: {
      name?: string;
      slug?: string;
      offlineModeEnabled?: boolean;
      onlineStoreEnabled?: boolean;
      financeModuleEnabled?: boolean;
      onlineStoreWhatsappNumber?: string | null;
      onlineStoreWhatsappMessage?: string | null;
      stockAlertLowColor?: string;
      stockAlertOutColor?: string;
      stockAlertOkColor?: string;
      stockAlertLowThreshold?: number;
      stockAlertAvailableThreshold?: number;
    } = {};
    if (name !== undefined) data.name = name.trim();
    if (slug !== undefined) data.slug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (offlineModeEnabled !== undefined) {
      data.offlineModeEnabled = Boolean(offlineModeEnabled);
    }
    if (onlineStoreEnabled !== undefined) {
      data.onlineStoreEnabled = Boolean(onlineStoreEnabled);
    }
    if (financeModuleEnabled !== undefined) {
      data.financeModuleEnabled = Boolean(financeModuleEnabled);
    }
    if (onlineStoreWhatsappNumber !== undefined) {
      if (
        onlineStoreWhatsappNumber !== null &&
        typeof onlineStoreWhatsappNumber !== "string"
      ) {
        res.status(400).json({ error: "Número de WhatsApp inválido" });
        return;
      }
      data.onlineStoreWhatsappNumber = normalizeOptionalWhatsappNumber(onlineStoreWhatsappNumber);
    }
    if (onlineStoreWhatsappMessage !== undefined) {
      if (
        onlineStoreWhatsappMessage !== null &&
        typeof onlineStoreWhatsappMessage !== "string"
      ) {
        res.status(400).json({ error: "Mensagem padrão inválida" });
        return;
      }
      data.onlineStoreWhatsappMessage = normalizeOptionalMessage(onlineStoreWhatsappMessage);
    }
    if (stockAlertLowColor !== undefined) {
      if (typeof stockAlertLowColor !== "string") {
        res.status(400).json({ error: "Cor de alerta de estoque baixo inválida" });
        return;
      }
      const normalized = normalizeStockAlertColor(
        stockAlertLowColor,
        DEFAULT_STOCK_ALERT_LOW_COLOR
      );
      if (!normalized) {
        res.status(400).json({ error: "Use cores no formato hexadecimal (#RRGGBB)" });
        return;
      }
      data.stockAlertLowColor = normalized;
    }
    if (stockAlertOutColor !== undefined) {
      if (typeof stockAlertOutColor !== "string") {
        res.status(400).json({ error: "Cor de alerta sem estoque inválida" });
        return;
      }
      const normalized = normalizeStockAlertColor(
        stockAlertOutColor,
        DEFAULT_STOCK_ALERT_OUT_COLOR
      );
      if (!normalized) {
        res.status(400).json({ error: "Use cores no formato hexadecimal (#RRGGBB)" });
        return;
      }
      data.stockAlertOutColor = normalized;
    }
    if (stockAlertOkColor !== undefined) {
      if (typeof stockAlertOkColor !== "string") {
        res.status(400).json({ error: "Cor de alerta de estoque disponível inválida" });
        return;
      }
      const normalized = normalizeStockAlertColor(
        stockAlertOkColor,
        DEFAULT_STOCK_ALERT_OK_COLOR
      );
      if (!normalized) {
        res.status(400).json({ error: "Use cores no formato hexadecimal (#RRGGBB)" });
        return;
      }
      data.stockAlertOkColor = normalized;
    }
    if (stockAlertLowThreshold !== undefined) {
      if (typeof stockAlertLowThreshold !== "number") {
        res.status(400).json({ error: "Valor de estoque baixo inválido" });
        return;
      }
      const normalized = normalizeStockAlertThreshold(
        stockAlertLowThreshold,
        DEFAULT_STOCK_ALERT_LOW_THRESHOLD
      );
      if (normalized == null) {
        res.status(400).json({ error: "O valor de estoque baixo é inválido" });
        return;
      }
      data.stockAlertLowThreshold = normalized;
    }
    if (stockAlertAvailableThreshold !== undefined) {
      if (typeof stockAlertAvailableThreshold !== "number") {
        res.status(400).json({ error: "Valor de estoque disponível inválido" });
        return;
      }
      const normalized = normalizeStockAlertThreshold(
        stockAlertAvailableThreshold,
        DEFAULT_STOCK_ALERT_AVAILABLE_THRESHOLD
      );
      if (normalized == null) {
        res.status(400).json({ error: "O valor de estoque disponível é inválido" });
        return;
      }
      data.stockAlertAvailableThreshold = normalized;
    }

    if (
      data.stockAlertLowThreshold !== undefined ||
      data.stockAlertAvailableThreshold !== undefined
    ) {
      const currentStore = await prisma.store.findUnique({
        where: { id },
        select: {
          stockAlertLowThreshold: true,
          stockAlertAvailableThreshold: true,
        },
      });
      if (!currentStore) {
        res.status(404).json({ error: "Loja não encontrada" });
        return;
      }
      const lowThreshold =
        data.stockAlertLowThreshold ?? currentStore.stockAlertLowThreshold;
      const availableThreshold =
        data.stockAlertAvailableThreshold ?? currentStore.stockAlertAvailableThreshold;
      if (availableThreshold <= lowThreshold) {
        res.status(400).json({
          error: "O valor de estoque disponível deve ser maior que o estoque baixo",
        });
        return;
      }
    }
    if (Object.keys(data).length === 0) {
      res
        .status(400)
        .json({
          error:
            "Envie dados da loja para atualizar (incluindo contato/cores/limites de estoque)",
        });
      return;
    }
    if (data.slug) {
      const existing = await prisma.store.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (existing) {
        res.status(400).json({ error: "Já existe outra loja com este slug" });
        return;
      }
    }
    const store = await prisma.store.update({ where: { id }, data });
    res.status(200).json(store);
  } catch (e) {
    console.error("Admin update store error:", e);
    res.status(500).json({ error: "Erro ao atualizar loja" });
  }
});

adminRouter.delete("/stores/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.store.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error("Admin delete store error:", e);
    res.status(500).json({ error: "Erro ao excluir loja" });
  }
});

adminRouter.get("/stores/:storeId/users", async (req, res) => {
  try {
    const { storeId } = req.params;
    const users = await prisma.user.findMany({
      where: { storeId, role: "STORE_USER" },
      select: { id: true, email: true, name: true, role: true, storeId: true, createdAt: true, updatedAt: true },
    });
    res.status(200).json(users);
  } catch (e) {
    console.error("Admin list store users error:", e);
    res.status(500).json({ error: "Erro ao listar usuários" });
  }
});

adminRouter.post("/stores/:storeId/users", async (req, res) => {
  try {
    const { storeId } = req.params;
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
    if (!email?.trim() || !password || !name?.trim()) {
      res.status(400).json({ error: "Email, senha e nome são obrigatórios" });
      return;
    }
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      res.status(404).json({ error: "Loja não encontrada" });
      return;
    }
    const emailNorm = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing) {
      res.status(400).json({ error: "Já existe um usuário com este e-mail" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        passwordHash,
        name: name.trim(),
        role: "STORE_USER",
        storeId,
      },
      select: { id: true, email: true, name: true, role: true, storeId: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json(user);
  } catch (e) {
    console.error("Admin create store user error:", e);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

adminRouter.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, password } = req.body as { name?: string; password?: string };
    const data: { name?: string; passwordHash?: string } = {};
    if (name !== undefined) data.name = name.trim();
    if (password !== undefined && password.length > 0) {
      data.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Envie name ou password para atualizar" });
      return;
    }
    const user = await prisma.user.update({
      where: { id },
      data: data as { name?: string; passwordHash?: string },
      select: { id: true, email: true, name: true, role: true, storeId: true, createdAt: true, updatedAt: true },
    });
    res.status(200).json(user);
  } catch (e) {
    console.error("Admin update user error:", e);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

adminRouter.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    console.error("Admin delete user error:", e);
    res.status(500).json({ error: "Erro ao excluir usuário" });
  }
});
