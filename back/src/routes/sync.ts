import { Router } from "express";
import { prisma } from "../db.js";
import { NotificationType, ProductCategory, PaymentMethod } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.js";
import { requireStoreUserOrSuperAdmin } from "../middleware/auth.js";

export const syncRouter = Router();
syncRouter.use(authMiddleware);
syncRouter.use(requireStoreUserOrSuperAdmin);

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
  type?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  color?: string | null;
  description?: string | null;
  controlNumber?: string | null;
  tennisSizes?: {
    id?: string;
    number?: string | null;
    stock?: number | null;
    sku?: string | null;
    barcode?: string | null;
  }[];
  clothingSizes?: {
    id?: string;
    number?: string | null;
    stock?: number | null;
    sku?: string | null;
    barcode?: string | null;
  }[];
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
  if (["dinheiro", "credito", "debito", "pix", "fiado"].includes(s)) return s as PaymentMethod;
  return "dinheiro";
}

type SalePaymentInput = { saleId: string; method: string; amountCents: number };

type NormalizedSalePayment = {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amountCents: number;
};

function buildSalePaymentId(saleId: string, method: PaymentMethod): string {
  return `${saleId}:${method}`;
}

function normalizeSalePayments(payments: SalePaymentInput[]): NormalizedSalePayment[] {
  const dedupeByExactValue = new Set<string>();
  const aggregated = new Map<string, { saleId: string; method: PaymentMethod; amountCents: number }>();

  for (const payment of payments) {
    const saleId = (payment.saleId ?? "").trim();
    if (!saleId) continue;

    const method = toPaymentMethod(payment.method ?? "");
    const amountRaw = Number(payment.amountCents ?? 0);
    if (!Number.isFinite(amountRaw)) continue;
    const amountCents = Math.max(0, Math.floor(amountRaw));
    if (amountCents <= 0) continue;

    const exactValueKey = `${saleId}|${method}|${amountCents}`;
    if (dedupeByExactValue.has(exactValueKey)) continue;
    dedupeByExactValue.add(exactValueKey);

    const key = `${saleId}|${method}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.amountCents += amountCents;
      continue;
    }

    aggregated.set(key, {
      saleId,
      method,
      amountCents,
    });
  }

  return Array.from(aggregated.values()).map((payment) => ({
    id: buildSalePaymentId(payment.saleId, payment.method),
    saleId: payment.saleId,
    method: payment.method,
    amountCents: payment.amountCents,
  }));
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function buildSaleNotificationMessage(totalCents: number, itemsCount: number): string {
  const itemsLabel = itemsCount === 1 ? "1 item" : `${itemsCount} itens`;
  return `${itemsLabel} · Total ${CURRENCY_FORMATTER.format(totalCents / 100)}`;
}

function normalizeTennisSizes(
  payload: ProductPayload
): Array<{ id: string; number: string; stock: number; sku: string | null; barcode: string | null }> {
  const sizesFromPayload = Array.isArray(payload.tennisSizes) ? payload.tennisSizes : [];
  const fallbackLegacySize =
    (payload.size ?? "").trim() !== ""
      ? [
          {
            id: `legacy_${payload.id}_${(payload.size ?? "").trim()}`,
            number: (payload.size ?? "").trim(),
            stock: payload.stock,
            sku: payload.sku ?? null,
            barcode: payload.barcode ?? null,
          },
        ]
      : [];

  const source = sizesFromPayload.length > 0 ? sizesFromPayload : fallbackLegacySize;
  const seen = new Set<string>();
  const normalized: Array<{
    id: string;
    number: string;
    stock: number;
    sku: string | null;
    barcode: string | null;
  }> = [];

  for (const raw of source) {
    const number = (raw.number ?? "").trim();
    if (!number) continue;
    const id = (raw.id ?? crypto.randomUUID()).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    normalized.push({
      id,
      number,
      stock: Math.max(0, Number(raw.stock ?? 0) || 0),
      sku: (raw.sku ?? "").trim() || null,
      barcode: (raw.barcode ?? "").trim() || null,
    });
  }

  return normalized;
}

function normalizeClothingSizes(
  payload: ProductPayload
): Array<{ id: string; number: string; stock: number; sku: string | null; barcode: string | null }> {
  const sizesFromPayload = Array.isArray(payload.clothingSizes) ? payload.clothingSizes : [];
  const fallbackLegacySize =
    (payload.size ?? "").trim() !== ""
      ? [
          {
            id: `legacy_roupa_${payload.id}_${(payload.size ?? "").trim()}`,
            number: (payload.size ?? "").trim(),
            stock: payload.stock,
            sku: payload.sku ?? null,
            barcode: payload.barcode ?? null,
          },
        ]
      : payload.stock > 0
        ? [
            {
              id: `legacy_roupa_${payload.id}_U`,
              number: "U",
              stock: payload.stock,
              sku: payload.sku ?? null,
              barcode: payload.barcode ?? null,
            },
          ]
        : [];

  const source = sizesFromPayload.length > 0 ? sizesFromPayload : fallbackLegacySize;
  const seen = new Set<string>();
  const normalized: Array<{
    id: string;
    number: string;
    stock: number;
    sku: string | null;
    barcode: string | null;
  }> = [];

  for (const raw of source) {
    const number = (raw.number ?? "").trim();
    if (!number) continue;
    const id = (raw.id ?? crypto.randomUUID()).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    normalized.push({
      id,
      number,
      stock: Math.max(0, Number(raw.stock ?? 0) || 0),
      sku: (raw.sku ?? "").trim() || null,
      barcode: (raw.barcode ?? "").trim() || null,
    });
  }

  return normalized;
}

syncRouter.post("/", async (req, res) => {
  try {
    const body = req.body as SyncBody & { storeId?: string };
    let storeId: string | null =
      req.user!.role === "STORE_USER" ? req.user!.storeId : (body.storeId ?? null) || null;
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (envie no body para super admin)" });
      return;
    }
    const products = body.products ?? [];
    const sales = body.sales ?? [];
    const saleItems = body.sale_items ?? [];
    const explicitSalePayments = body.sale_payments ?? [];
    const stockLogs = body.stock_logs ?? [];
    const newSaleNotifications: Array<{
      id: string;
      storeId: string;
      type: NotificationType;
      title: string;
      message: string;
      saleId: string;
      createdAt: Date;
    }> = [];

    const now = new Date();

    const existingSaleIds = new Set<string>();
    if (sales.length > 0) {
      const ids = sales.map((s) => s.id);
      const existingSales = await prisma.sale.findMany({
        where: {
          storeId,
          id: { in: ids },
        },
        select: { id: true },
      });
      for (const s of existingSales) existingSaleIds.add(s.id);
    }

    const paymentsFromSales: SalePaymentInput[] = [];
    if (explicitSalePayments.length === 0 && sales.length > 0) {
      for (const sale of sales) {
        for (const p of sale.payments ?? []) {
          paymentsFromSales.push({
            saleId: sale.id,
            method: p.method,
            amountCents: p.amountCents,
          });
        }
      }
    }

    const paymentsToCreate = normalizeSalePayments(
      explicitSalePayments.length > 0
        ? explicitSalePayments.map((sp) => ({
            saleId: sp.saleId,
            method: sp.method,
            amountCents: sp.amountCents,
          }))
        : paymentsFromSales
    );

    const saleIdsWithPayments = new Set<string>();
    for (const sp of paymentsToCreate) saleIdsWithPayments.add(sp.saleId);
    if (saleIdsWithPayments.size > 0) {
      await prisma.salePayment.deleteMany({
        where: { saleId: { in: [...saleIdsWithPayments] } },
      });
    }

    for (const p of products) {
      const parsedCategory = toProductCategory(p.category);
      const productType =
        p.type ?? (parsedCategory === "controles" ? p.brand ?? null : null);
      const tennisSizes =
        parsedCategory === "tenis" ? normalizeTennisSizes(p) : [];
      const clothingSizes =
        parsedCategory === "roupas" ? normalizeClothingSizes(p) : [];
      const resolvedStock =
        parsedCategory === "tenis"
          ? (tennisSizes.length > 0
              ? tennisSizes.reduce((sum, size) => sum + size.stock, 0)
              : p.stock)
          : parsedCategory === "roupas"
            ? (clothingSizes.length > 0
                ? clothingSizes.reduce((sum, size) => sum + size.stock, 0)
                : p.stock)
          : p.stock;
      await prisma.product.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          storeId,
          name: p.name,
          sku: p.sku ?? null,
          barcode: p.barcode ?? null,
          stock: resolvedStock,
          priceCents: p.priceCents,
          costCents: p.costCents ?? null,
          category: parsedCategory,
          imageUrl: p.imageUrl ?? null,
          type: productType,
          brand: p.brand ?? null,
          model: p.model ?? null,
          size: parsedCategory === "tenis" || parsedCategory === "roupas" ? null : p.size ?? null,
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
          stock: resolvedStock,
          priceCents: p.priceCents,
          costCents: p.costCents ?? null,
          category: parsedCategory,
          imageUrl: p.imageUrl ?? null,
          type: productType,
          brand: p.brand ?? null,
          model: p.model ?? null,
          size: parsedCategory === "tenis" || parsedCategory === "roupas" ? null : p.size ?? null,
          color: p.color ?? null,
          description: p.description ?? null,
          controlNumber: p.controlNumber ?? null,
          updatedAt: now,
        },
      });

      if (parsedCategory === "tenis") {
        await prisma.tennisSize.deleteMany({
          where: {
            productId: p.id,
            ...(tennisSizes.length > 0
              ? { id: { notIn: tennisSizes.map((size) => size.id) } }
              : {}),
          },
        });

        for (const size of tennisSizes) {
          await prisma.tennisSize.upsert({
            where: { id: size.id },
            create: {
              id: size.id,
              productId: p.id,
              number: size.number,
              stock: size.stock,
              sku: size.sku,
              barcode: size.barcode,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            },
            update: {
              productId: p.id,
              number: size.number,
              stock: size.stock,
              sku: size.sku,
              barcode: size.barcode,
              updatedAt: now,
            },
          });
        }
      } else {
        await prisma.tennisSize.deleteMany({ where: { productId: p.id } });
      }

      if (parsedCategory === "roupas") {
        await prisma.clothingSize.deleteMany({
          where: {
            productId: p.id,
            ...(clothingSizes.length > 0
              ? { id: { notIn: clothingSizes.map((size) => size.id) } }
              : {}),
          },
        });

        for (const size of clothingSizes) {
          await prisma.clothingSize.upsert({
            where: { id: size.id },
            create: {
              id: size.id,
              productId: p.id,
              number: size.number,
              stock: size.stock,
              sku: size.sku,
              barcode: size.barcode,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            },
            update: {
              productId: p.id,
              number: size.number,
              stock: size.stock,
              sku: size.sku,
              barcode: size.barcode,
              updatedAt: now,
            },
          });
        }
      } else {
        await prisma.clothingSize.deleteMany({ where: { productId: p.id } });
      }
    }

    for (const s of sales) {
      await prisma.sale.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          storeId,
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

      if (!existingSaleIds.has(s.id)) {
        newSaleNotifications.push({
          id: crypto.randomUUID(),
          storeId,
          type: NotificationType.sale_created,
          title: "Nova venda registrada",
          message: buildSaleNotificationMessage(s.totalCents, s.itemsCount),
          saleId: s.id,
          createdAt: now,
        });
      }
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

    if (paymentsToCreate.length > 0) {
      await prisma.salePayment.createMany({
        data: paymentsToCreate.map((sp) => ({
          id: sp.id,
          saleId: sp.saleId,
          method: sp.method,
          amountCents: sp.amountCents,
        })),
        skipDuplicates: true,
      });
    }

    for (const sl of stockLogs) {
      await prisma.stockLog.upsert({
        where: { id: sl.id },
        create: {
          id: sl.id,
          storeId,
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

    if (newSaleNotifications.length > 0) {
      await prisma.notification.createMany({
        data: newSaleNotifications,
        skipDuplicates: true,
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
    const storeIdParam = req.query.storeId as string | undefined;
    const storeId =
      req.user!.role === "SUPER_ADMIN" && storeIdParam ? storeIdParam : req.user!.storeId;
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }
    const sinceDate = since ? new Date(since) : new Date(0);
    const storeFilter = { storeId };

    const [products, sales, saleItems, salePayments, stockLogs] = await Promise.all([
      prisma.product.findMany({
        where: { ...storeFilter, updatedAt: { gt: sinceDate } },
        include: { tennisSizes: true, clothingSizes: true },
      }),
      prisma.sale.findMany({
        where: { ...storeFilter, updatedAt: { gt: sinceDate } },
        include: { items: true, payments: true },
      }),
      prisma.saleItem.findMany({
        where: { sale: { storeId, updatedAt: { gt: sinceDate } } },
      }),
      prisma.salePayment.findMany({
        where: { sale: { storeId, updatedAt: { gt: sinceDate } } },
      }),
      prisma.stockLog.findMany({
        where: { ...storeFilter, createdAt: { gt: sinceDate } },
      }),
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
        tennisSizes: p.tennisSizes.map((size) => ({
          ...size,
          createdAt: size.createdAt.toISOString(),
          updatedAt: size.updatedAt.toISOString(),
        })),
        clothingSizes: p.clothingSizes.map((size) => ({
          ...size,
          createdAt: size.createdAt.toISOString(),
          updatedAt: size.updatedAt.toISOString(),
        })),
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
