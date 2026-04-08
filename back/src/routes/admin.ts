import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/auth.js";

const SALT_ROUNDS = 10;

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
    const { name, slug, offlineModeEnabled } = req.body as {
      name?: string;
      slug?: string;
      offlineModeEnabled?: boolean;
    };
    if (!name?.trim() || !slug?.trim()) {
      res.status(400).json({ error: "Nome e slug são obrigatórios" });
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
    const { name, slug, offlineModeEnabled } = req.body as {
      name?: string;
      slug?: string;
      offlineModeEnabled?: boolean;
    };
    const data: { name?: string; slug?: string; offlineModeEnabled?: boolean } = {};
    if (name !== undefined) data.name = name.trim();
    if (slug !== undefined) data.slug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (offlineModeEnabled !== undefined) {
      data.offlineModeEnabled = Boolean(offlineModeEnabled);
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Envie name, slug ou offlineModeEnabled para atualizar" });
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
