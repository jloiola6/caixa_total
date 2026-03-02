import { Router } from "express";
import { prisma } from "../db.js";

export const reportRouter = Router();

reportRouter.get("/summary", async (req, res) => {
  try {
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();

    const sales = await prisma.sale.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "asc" },
    });

    const byDate = new Map<
      string,
      { date: string; totalCents: number; salesCount: number; itemsCount: number }
    >();
    for (const s of sales) {
      const dateKey = s.createdAt.toISOString().slice(0, 10);
      const existing = byDate.get(dateKey);
      if (existing) {
        existing.totalCents += s.totalCents;
        existing.salesCount += 1;
        existing.itemsCount += s.itemsCount;
      } else {
        byDate.set(dateKey, {
          date: dateKey,
          totalCents: s.totalCents,
          salesCount: 1,
          itemsCount: s.itemsCount,
        });
      }
    }
    const summary = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    res.status(200).json(summary);
  } catch (e) {
    console.error("Report summary error:", e);
    res.status(500).json({ error: String(e) });
  }
});

reportRouter.get("/sales", async (req, res) => {
  try {
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      include: { items: true, payments: true },
      orderBy: { createdAt: "desc" },
    });

    const result = sales.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      totalCents: s.totalCents,
      itemsCount: s.itemsCount,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      payments: s.payments.map((p) => ({ method: p.method, amountCents: p.amountCents })),
      items: s.items,
    }));
    res.status(200).json(result);
  } catch (e) {
    console.error("Report sales error:", e);
    res.status(500).json({ error: String(e) });
  }
});

reportRouter.get("/top-products", async (req, res) => {
  try {
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: startDate, lte: endDate },
        },
      },
    });

    const byProduct = new Map<
      string,
      { productId: string; productName: string; totalQty: number; totalCents: number }
    >();
    for (const si of saleItems) {
      const existing = byProduct.get(si.productId);
      if (existing) {
        existing.totalQty += si.qty;
        existing.totalCents += si.lineTotalCents;
      } else {
        byProduct.set(si.productId, {
          productId: si.productId,
          productName: si.productName,
          totalQty: si.qty,
          totalCents: si.lineTotalCents,
        });
      }
    }
    const top = Array.from(byProduct.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, limit);
    res.status(200).json(top);
  } catch (e) {
    console.error("Report top-products error:", e);
    res.status(500).json({ error: String(e) });
  }
});
