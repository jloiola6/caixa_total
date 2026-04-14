import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { Resend } from "resend";
import { config } from "../config.js";
import { sanitizeStoreMobileMenuShortcuts } from "../lib/mobile-menu.js";

export const authRouter = Router();

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 1;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_STOCK_ALERT_LOW_COLOR = "#f59e0b";
const DEFAULT_STOCK_ALERT_OUT_COLOR = "#ef4444";
const DEFAULT_STOCK_ALERT_OK_COLOR = "#22c55e";
const DEFAULT_STOCK_ALERT_LOW_THRESHOLD = 5;
const DEFAULT_STOCK_ALERT_AVAILABLE_THRESHOLD = 6;
const STORE_PAYLOAD_SELECT = {
  id: true,
  name: true,
  slug: true,
  offlineModeEnabled: true,
  onlineStoreEnabled: true,
  financeModuleEnabled: true,
  mobileMenuShortcuts: true,
  onlineStoreWhatsappNumber: true,
  onlineStoreWhatsappMessage: true,
  stockAlertLowColor: true,
  stockAlertOutColor: true,
  stockAlertOkColor: true,
  stockAlertLowThreshold: true,
  stockAlertAvailableThreshold: true,
} as const;
const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  storeId: true,
  store: {
    select: STORE_PAYLOAD_SELECT,
  },
} as const;
const LOGIN_USER_SELECT = {
  ...AUTH_USER_SELECT,
  passwordHash: true,
} as const;

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

function buildStorePayload(
  store: {
    id: string;
    name: string;
    slug: string;
    offlineModeEnabled: boolean;
    onlineStoreEnabled: boolean;
    financeModuleEnabled: boolean;
    mobileMenuShortcuts: string[];
    onlineStoreWhatsappNumber: string | null;
    onlineStoreWhatsappMessage: string | null;
    stockAlertLowColor: string;
    stockAlertOutColor: string;
    stockAlertOkColor: string;
    stockAlertLowThreshold: number;
    stockAlertAvailableThreshold: number;
  } | null
) {
  if (!store) return null;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    offlineModeEnabled: store.offlineModeEnabled,
    onlineStoreEnabled: store.onlineStoreEnabled,
    financeModuleEnabled: store.financeModuleEnabled,
    mobileMenuShortcuts: store.mobileMenuShortcuts,
    onlineStoreWhatsappNumber: store.onlineStoreWhatsappNumber,
    onlineStoreWhatsappMessage: store.onlineStoreWhatsappMessage,
    stockAlertLowColor: store.stockAlertLowColor,
    stockAlertOutColor: store.stockAlertOutColor,
    stockAlertOkColor: store.stockAlertOkColor,
    stockAlertLowThreshold: store.stockAlertLowThreshold,
    stockAlertAvailableThreshold: store.stockAlertAvailableThreshold,
  };
}

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email e senha são obrigatórios" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: LOGIN_USER_SELECT,
    });
    if (!user) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        store: buildStorePayload(user.store),
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

authRouter.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email é obrigatório" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });
      const resetLink = `${config.frontUrl.replace(/\/$/, "")}/redefinir-senha?token=${token}`;
      if (resend) {
        await resend.emails.send({
          from: config.resendFrom,
          to: user.email,
          subject: "Redefinir senha - CaixaTotal",
          html: `<p>Clique no link para redefinir sua senha:</p><p><a href="${resetLink}">${resetLink}</a></p><p>O link expira em ${TOKEN_EXPIRY_HOURS} hora(s).</p>`,
        });
      } else {
        console.log("[forgot-password] Reset link (no Resend configured):", resetLink);
      }
    }
    res.status(200).json({
      message: "Se existir uma conta com este e-mail, você receberá um link para redefinir a senha.",
    });
  } catch (e) {
    console.error("Forgot password error:", e);
    res.status(500).json({ error: "Erro ao processar solicitação" });
  }
});

authRouter.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "Token e nova senha (mín. 6 caracteres) são obrigatórios" });
      return;
    }
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      res.status(400).json({ error: "Link inválido ou expirado" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.delete({ where: { id: resetRecord.id } }),
    ]);
    res.status(200).json({ message: "Senha alterada com sucesso" });
  } catch (e) {
    console.error("Reset password error:", e);
    res.status(500).json({ error: "Erro ao redefinir senha" });
  }
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: AUTH_USER_SELECT,
    });
    if (!user) {
      res.status(401).json({ error: "Usuário não encontrado" });
      return;
    }
    res.status(200).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      store: buildStorePayload(user.store),
    });
  } catch (e) {
    console.error("Me error:", e);
    res.status(500).json({ error: "Erro ao obter usuário" });
  }
});

authRouter.patch("/me/store-settings", authMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    if (req.user.role !== "STORE_USER" || !req.user.storeId) {
      res.status(403).json({ error: "Apenas usuário de loja pode atualizar estas configurações" });
      return;
    }

    const {
      onlineStoreWhatsappNumber,
      onlineStoreWhatsappMessage,
      mobileMenuShortcuts,
      stockAlertLowColor,
      stockAlertOutColor,
      stockAlertOkColor,
      stockAlertLowThreshold,
      stockAlertAvailableThreshold,
    } = req.body as {
      onlineStoreWhatsappNumber?: string | null;
      onlineStoreWhatsappMessage?: string | null;
      mobileMenuShortcuts?: string[];
      stockAlertLowColor?: string;
      stockAlertOutColor?: string;
      stockAlertOkColor?: string;
      stockAlertLowThreshold?: number;
      stockAlertAvailableThreshold?: number;
    };

    const data: {
      onlineStoreWhatsappNumber?: string | null;
      onlineStoreWhatsappMessage?: string | null;
      mobileMenuShortcuts?: string[];
      stockAlertLowColor?: string;
      stockAlertOutColor?: string;
      stockAlertOkColor?: string;
      stockAlertLowThreshold?: number;
      stockAlertAvailableThreshold?: number;
    } = {};

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

    if (mobileMenuShortcuts !== undefined) {
      if (
        !Array.isArray(mobileMenuShortcuts) ||
        mobileMenuShortcuts.some((value) => typeof value !== "string")
      ) {
        res.status(400).json({ error: "Atalhos do menu mobile invÃ¡lidos" });
        return;
      }
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
      mobileMenuShortcuts !== undefined ||
      data.stockAlertLowThreshold !== undefined ||
      data.stockAlertAvailableThreshold !== undefined
    ) {
      const currentStore = await prisma.store.findUnique({
        where: { id: req.user.storeId },
        select: {
          financeModuleEnabled: true,
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
      if (mobileMenuShortcuts !== undefined) {
        data.mobileMenuShortcuts = sanitizeStoreMobileMenuShortcuts(
          mobileMenuShortcuts,
          currentStore.financeModuleEnabled
        );
      }
      if (availableThreshold <= lowThreshold) {
        res.status(400).json({
          error: "O valor de estoque disponível deve ser maior que o estoque baixo",
        });
        return;
      }
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nenhuma configuração válida enviada" });
      return;
    }

    if (
      mobileMenuShortcuts !== undefined &&
      data.mobileMenuShortcuts === undefined
    ) {
      const currentStore = await prisma.store.findUnique({
        where: { id: req.user.storeId },
        select: { financeModuleEnabled: true },
      });
      if (!currentStore) {
        res.status(404).json({ error: "Loja nÃ£o encontrada" });
        return;
      }
      data.mobileMenuShortcuts = sanitizeStoreMobileMenuShortcuts(
        mobileMenuShortcuts,
        currentStore.financeModuleEnabled
      );
    }

    const updatedStore = await prisma.store.update({
      where: { id: req.user.storeId },
      data,
      select: STORE_PAYLOAD_SELECT,
    });

    res.status(200).json(buildStorePayload(updatedStore));
  } catch (e) {
    console.error("Update own store settings error:", e);
    res.status(500).json({ error: "Erro ao salvar configurações da loja" });
  }
});
