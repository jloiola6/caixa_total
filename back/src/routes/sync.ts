import { Router } from "express";
import { prisma } from "../db.js";
import { ProductCategory, PaymentMethod } from "@prisma/client";

export const syncRouter = Router();

type ProductPayload = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  stock: number;
  priceCents: number;
  costCents?: number | null;
  category: string;
  imageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  color?: string | null;
  description?: string | null;
  controlNumber?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentPayload = { method: string; amountCents: number };

type SalePayload = {
  id: string;
  createdAt: string;
  totalCents: number;
  itemsCount: number;
  payments: PaymentPayload[];
  customerName?: string | null;
  customerPhone?: string | null;
};

type SaleItemPayload = {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  sku?: string | null;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

type StockLogPayload = {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  reason?: string | null;
  createdAt: string;
};

type SyncBody = {
  products?: ProductPayload[];
  sales?: SalePayload[];
  sale_items?: SaleItemPayload[];
  sale_payments?: { id: string; saleId: string; method: string; amountCents: number }[];
  stock_logs?: StockLogPayload[];
};

function toProductCategory(s: string): ProductCategory {
  if (["roupas", "tenis", "controles", "eletronicos", "diversos"].includes(s)) return s as ProductCategory;
  return "diversos";
}

function toPaymentMethod(s: string): PaymentMethod {
  if (["dinheiro", "credito", "debito", "fiado"].includes(s)) return s as PaymentMethod;
  return "dinheiro";
}

syncRouter.post("/", async (req, res) => {
  try {
    const body = req.body as SyncBody;
    const products = body.products ?? [];
    const sales = body.sales ?? [];
    const saleItems = body.sale_items ?? [];
    const explicitSalePayments = body.sale_payments ?? [];
    const stockLogs = body.stock_logs ?? [];

    const now = new Date();

    const paymentsFromSales: { id: string; saleId: string; method: string; amountCents: number }[] = [];
    if (explicitSalePayments.length === 0 && sales.length > 0) {
      for (const sale of sales) {
        for (const p of sale.payments ?? []) {
          paymentsFromSales.push({
            id: crypto.randomUUID(),
            saleId: sale.id,
            method: p.method,
            amountCents: p.amountCents,
          });
        }
      }
    }

    const saleIdsWithPayments = new Set<string>();
    for (const sp of explicitSalePayments) saleIdsWithPayments.add(sp.saleId);
    for (const p of paymentsFromSales) saleIdsWithPayments.add(p.saleId);
    if (saleIdsWithPayments.size > 0) {
      await prisma.salePayment.deleteMany({
        where: { saleId: { in: [...saleIdsWithPayments] } },
      });
    }

    for (const p of products) {
      await prisma.product.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          barcode: p.barcode ?? null,
          stock: p.stock,
          priceCents: p.priceCents,
          costCents: p.costCents ?? null,
          category: toProductCategory(p.category),
          imageUrl: p.imageUrl ?? null,
          brand: p.brand ?? null,
          model: p.model ?? null,
          size: p.size ?? null,
          color: p.color ?? null,
          description: p.description ?? null,
          controlNumber: p.controlNumber ?? null,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        },
        update: {
          name: p.name,
          sku: p.sku ?? null,
          barcode: p.barcode ?? null,
          stock: p.stock,
          priceCents: p.priceCents,
          costCents: p.costCents ?? null,
          category: toProductCategory(p.category),
          imageUrl: p.imageUrl ?? null,
          brand: p.brand ?? null,
          model: p.model ?? null,
          size: p.size ?? null,
          color: p.color ?? null,
          description: p.description ?? null,
          controlNumber: p.controlNumber ?? null,
          updatedAt: now,
        },
      });
    }

    for (const s of sales) {
      await prisma.sale.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          createdAt: new Date(s.createdAt),
          totalCents: s.totalCents,
          itemsCount: s.itemsCount,
          customerName: s.customerName ?? null,
          customerPhone: s.customerPhone ?? null,
          updatedAt: now,
        },
        update: {
          createdAt: new Date(s.createdAt),
          totalCents: s.totalCents,
          itemsCount: s.itemsCount,
          customerName: s.customerName ?? null,
          customerPhone: s.customerPhone ?? null,
          updatedAt: now,
        },
      });
    }

    for (const si of saleItems) {
      await prisma.saleItem.upsert({
        where: { id: si.id },
        create: {
          id: si.id,
          saleId: si.saleId,
          productId: si.productId,
          productName: si.productName,
          sku: si.sku ?? null,
          qty: si.qty,
          unitPriceCents: si.unitPriceCents,
          lineTotalCents: si.lineTotalCents,
        },
        update: {
          saleId: si.saleId,
          productId: si.productId,
          productName: si.productName,
          sku: si.sku ?? null,
          qty: si.qty,
          unitPriceCents: si.unitPriceCents,
          lineTotalCents: si.lineTotalCents,
        },
      });
    }

    const paymentsToCreate =
      explicitSalePayments.length > 0
        ? explicitSalePayments
        : paymentsFromSales;
    if (paymentsToCreate.length > 0) {
      await prisma.salePayment.createMany({
        data: paymentsToCreate.map((sp) => ({
          id: sp.id,
          saleId: sp.saleId,
          method: toPaymentMethod(sp.method),
          amountCents: sp.amountCents,
        })),
      });
    }

    for (const sl of stockLogs) {
      await prisma.stockLog.upsert({
        where: { id: sl.id },
        create: {
          id: sl.id,
          productId: sl.productId,
          productName: sl.productName,
          delta: sl.delta,
          reason: sl.reason ?? null,
          createdAt: new Date(sl.createdAt),
        },
        update: {
          productId: sl.productId,
          productName: sl.productName,
          delta: sl.delta,
          reason: sl.reason ?? null,
          createdAt: new Date(sl.createdAt),
        },
      });
    }

    res.status(200).json({ ok: true, serverTime: now.toISOString() });
  } catch (e) {
    console.error("Sync error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

syncRouter.get("/", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const sinceDate = since ? new Date(since) : new Date(0);

    const [products, sales, saleItems, salePayments, stockLogs] = await Promise.all([
      prisma.product.findMany({ where: { updatedAt: { gt: sinceDate } } }),
      prisma.sale.findMany({ where: { updatedAt: { gt: sinceDate } }, include: { items: true, payments: true } }),
      prisma.saleItem.findMany({ where: { sale: { updatedAt: { gt: sinceDate } } } }),
      prisma.salePayment.findMany({ where: { sale: { updatedAt: { gt: sinceDate } } } }),
      prisma.stockLog.findMany({ where: { createdAt: { gt: sinceDate } } }),
    ]);

    const salesWithPayments = sales.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      totalCents: s.totalCents,
      itemsCount: s.itemsCount,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      payments: s.payments.map((p) => ({ method: p.method, amountCents: p.amountCents })),
    }));

    res.status(200).json({
      products: products.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      sales: salesWithPayments,
      sale_items: saleItems,
      sale_payments: salePayments,
      stock_logs: stockLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    });
  } catch (e) {
    console.error("Sync GET error:", e);
    res.status(500).json({ error: String(e) });
  }
});
