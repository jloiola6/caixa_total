import { Router } from "express";
import { NotificationType } from "@prisma/client";
import { prisma } from "../db.js";
import { authMiddleware, requireStoreUserOrSuperAdmin } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(authMiddleware);
notificationsRouter.use(requireStoreUserOrSuperAdmin);

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function buildSaleNotificationMessage(totalCents: number, itemsCount: number): string {
  const itemsLabel = itemsCount === 1 ? "1 item" : `${itemsCount} itens`;
  return `${itemsLabel} · Total ${CURRENCY_FORMATTER.format(totalCents / 100)}`;
}

function resolveStoreId(req: {
  user?: { role: string; storeId: string | null };
  query?: { storeId?: unknown };
}): string | null {
  if (!req.user) return null;
  if (req.user.role === "SUPER_ADMIN") {
    return typeof req.query?.storeId === "string" ? req.query.storeId : null;
  }
  return req.user.storeId;
}

notificationsRouter.get("/", async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    if (!storeId) {
      res
        .status(400)
        .json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }

    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 500)
      : 100;
    const unreadOnly =
      req.query.unreadOnly === "1" ||
      req.query.unreadOnly === "true" ||
      req.query.unreadOnly === "yes";

    let notifications = await prisma.notification.findMany({
      where: {
        storeId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      include: {
        sale: {
          select: { createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Backfill defensivo: se já houver vendas, mas a tabela de notificações estiver vazia,
    // gera notificações de venda para restaurar a listagem.
    if (!unreadOnly && notifications.length === 0) {
      const salesToBackfill = await prisma.sale.findMany({
        where: { storeId },
        select: {
          id: true,
          createdAt: true,
          totalCents: true,
          itemsCount: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      if (salesToBackfill.length > 0) {
        await prisma.notification.createMany({
          data: salesToBackfill.map((sale) => ({
            storeId,
            type: NotificationType.sale_created,
            title: "Nova venda registrada",
            message: buildSaleNotificationMessage(sale.totalCents, sale.itemsCount),
            saleId: sale.id,
            createdAt: sale.createdAt,
          })),
          skipDuplicates: true,
        });

        notifications = await prisma.notification.findMany({
          where: {
            storeId,
            ...(unreadOnly ? { readAt: null } : {}),
          },
          include: {
            sale: {
              select: { createdAt: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
      }
    }

    res.status(200).json(
      notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        saleId: n.saleId,
        saleCreatedAt: n.sale?.createdAt ? n.sale.createdAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null,
      }))
    );
  } catch (e) {
    console.error("Notifications list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

notificationsRouter.get("/unread-count", async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    if (!storeId) {
      res
        .status(400)
        .json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }

    const count = await prisma.notification.count({
      where: { storeId, readAt: null },
    });

    res.status(200).json({ unreadCount: count });
  } catch (e) {
    console.error("Notifications unread-count error:", e);
    res.status(500).json({ error: String(e) });
  }
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    if (!storeId) {
      res
        .status(400)
        .json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }

    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "id é obrigatório" });
      return;
    }

    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        id,
        storeId,
        readAt: null,
      },
      data: {
        readAt: now,
      },
    });

    res.status(200).json({ ok: true, updated: result.count });
  } catch (e) {
    console.error("Notifications mark-read error:", e);
    res.status(500).json({ error: String(e) });
  }
});

notificationsRouter.post("/read-all", async (req, res) => {
  try {
    const storeId = resolveStoreId(req);
    if (!storeId) {
      res
        .status(400)
        .json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }

    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        storeId,
        readAt: null,
      },
      data: {
        readAt: now,
      },
    });

    res.status(200).json({ ok: true, updated: result.count });
  } catch (e) {
    console.error("Notifications read-all error:", e);
    res.status(500).json({ error: String(e) });
  }
});
