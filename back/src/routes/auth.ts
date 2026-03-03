import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { Resend } from "resend";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const FRONT_URL = process.env.FRONT_URL ?? "http://localhost:3000";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY_HOURS = 1;

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email e senha são obrigatórios" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { store: true },
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
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        store: user.store ? { id: user.store.id, name: user.store.name, slug: user.store.slug } : null,
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
      const resetLink = `${FRONT_URL.replace(/\/$/, "")}/redefinir-senha?token=${token}`;
      if (resend) {
        await resend.emails.send({
          from: RESEND_FROM,
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
      select: { id: true, email: true, name: true, role: true, storeId: true, store: true },
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
      store: user.store ? { id: user.store.id, name: user.store.name, slug: user.store.slug } : null,
    });
  } catch (e) {
    console.error("Me error:", e);
    res.status(500).json({ error: "Erro ao obter usuário" });
  }
});
