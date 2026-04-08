import { Router } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireStoreUserOrSuperAdmin } from "../middleware/auth.js";

export const reportRouter = Router();
reportRouter.use(authMiddleware);
reportRouter.use(requireStoreUserOrSuperAdmin);

const PRODUCT_VARIANT_SEPARATOR = "::";

function normalizeProductId(productId: string): string {
  const splitIndex = productId.indexOf(PRODUCT_VARIANT_SEPARATOR);
  if (splitIndex <= 0) return productId;
  return productId.slice(0, splitIndex);
}

function parseProductVariantId(
  productId: string
): { productId: string; sizeId: string } | null {
  const splitIndex = productId.indexOf(PRODUCT_VARIANT_SEPARATOR);
  if (splitIndex <= 0) return null;
  const baseProductId = productId.slice(0, splitIndex);
  const sizeId = productId.slice(splitIndex + PRODUCT_VARIANT_SEPARATOR.length);
  if (!baseProductId || !sizeId) return null;
  return { productId: baseProductId, sizeId };
}

function entryAffectsAccount(entry: {
  basis: string;
  status: string;
  accountId: string | null;
  settlementDate: Date | null;
}): boolean {
  if (!entry.accountId) return false;
  if (!entry.settlementDate) return false;
  if (entry.basis !== "caixa") return false;
  return entry.status === "approved" || entry.status === "reconciled";
}

function entrySignedAmountCents(direction: string, amountCents: number): number {
  const safeAmount = Math.max(0, Math.floor(amountCents));
  return direction === "entrada" ? safeAmount : -safeAmount;
}

function getStoreId(req: { user?: { role: string; storeId: string | null }; query?: { storeId?: string } }) {
  return req.user!.role === "SUPER_ADMIN" && req.query?.storeId
    ? (req.query.storeId as string)
    : req.user!.storeId!;
}

reportRouter.get("/summary", async (req, res) => {
  try {
    const storeId = getStoreId(req);
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();

    const sales = await prisma.sale.findMany({
      where: {
        storeId,
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
    const storeId = getStoreId(req);
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();

    const sales = await prisma.sale.findMany({
      where: { storeId, createdAt: { gte: startDate, lte: endDate } },
      include: { items: true, payments: true },
      orderBy: { createdAt: "desc" },
    });

    const normalizedProductIds = Array.from(
      new Set(
        sales.flatMap((sale) =>
          sale.items.map((item) => normalizeProductId(item.productId))
        )
      )
    );

    const products = normalizedProductIds.length
      ? await prisma.product.findMany({
          where: {
            storeId,
            id: { in: normalizedProductIds },
          },
          select: {
            id: true,
            category: true,
          },
        })
      : [];

    const productCategoryById = new Map(products.map((product) => [product.id, product.category]));

    const result = sales.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      totalCents: s.totalCents,
      itemsCount: s.itemsCount,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      payments: s.payments.map((p) => ({ method: p.method, amountCents: p.amountCents })),
      items: s.items.map((item) => ({
        id: item.id,
        saleId: item.saleId,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
        productCategory:
          productCategoryById.get(normalizeProductId(item.productId)) ?? null,
      })),
    }));
    res.status(200).json(result);
  } catch (e) {
    console.error("Report sales error:", e);
    res.status(500).json({ error: String(e) });
  }
});

reportRouter.delete("/sales/:saleId", async (req, res) => {
  try {
    const storeId = getStoreId(req);
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }

    const saleId = (req.params.saleId ?? "").trim();
    if (!saleId) {
      res.status(400).json({ error: "saleId é obrigatório" });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: {
          id: saleId,
          storeId,
        },
        include: {
          items: true,
          payments: true,
        },
      });

      if (!sale) {
        return { status: "not_found" as const };
      }

      const saleSourceRefPrefix = `sale:${sale.id}:`;

      const financialEntries = await tx.financialEntry.findMany({
        where: {
          storeId,
          sourceRef: { startsWith: saleSourceRefPrefix },
        },
        select: {
          id: true,
          sourceRef: true,
          accountId: true,
          basis: true,
          status: true,
          settlementDate: true,
          direction: true,
          amountCents: true,
          receivableId: true,
        },
      });

      const fiadoSourceRef = `sale:${sale.id}:fiado`;
      const fiadoEntry = financialEntries.find((entry) => entry.sourceRef === fiadoSourceRef);

      const fiadoReceivable = fiadoEntry?.receivableId
        ? await tx.accountsReceivable.findFirst({
            where: {
              id: fiadoEntry.receivableId,
              storeId,
            },
            include: {
              settlements: {
                select: { id: true },
              },
            },
          })
        : null;

      if (fiadoReceivable && fiadoReceivable.settlements.length > 0) {
        return { status: "fiado_already_settled" as const };
      }

      const stockRestoreByKey = new Map<
        string,
        { productId: string; sizeId: string | null; qty: number; productName: string }
      >();

      for (const item of sale.items) {
        const variant = parseProductVariantId(item.productId);
        const baseProductId = variant?.productId ?? item.productId;
        const sizeId = variant?.sizeId ?? null;
        const key = `${baseProductId}|${sizeId ?? ""}`;
        const safeQty = Math.max(0, item.qty);

        const existing = stockRestoreByKey.get(key);
        if (existing) {
          existing.qty += safeQty;
          continue;
        }

        stockRestoreByKey.set(key, {
          productId: baseProductId,
          sizeId,
          qty: safeQty,
          productName: item.productName,
        });
      }

      const stockAdjustments = Array.from(stockRestoreByKey.values()).filter(
        (item) => item.qty > 0
      );
      const productIds = Array.from(
        new Set(stockAdjustments.map((adjustment) => adjustment.productId))
      );

      const products = productIds.length
        ? await tx.product.findMany({
            where: {
              storeId,
              id: { in: productIds },
            },
            select: {
              id: true,
              name: true,
              category: true,
              tennisSizes: {
                select: {
                  id: true,
                  number: true,
                },
              },
              clothingSizes: {
                select: {
                  id: true,
                  number: true,
                },
              },
            },
          })
        : [];

      const productById = new Map(products.map((product) => [product.id, product]));
      const missingProducts: string[] = [];
      const invalidVariants: string[] = [];

      for (const adjustment of stockAdjustments) {
        const product = productById.get(adjustment.productId);
        if (!product) {
          missingProducts.push(adjustment.productName || adjustment.productId);
          continue;
        }

        if (!adjustment.sizeId) continue;

        if (product.category === "tenis") {
          const hasSize = product.tennisSizes.some(
            (size) => size.id === adjustment.sizeId
          );
          if (!hasSize) invalidVariants.push(`${product.name} (tamanho nao encontrado)`);
          continue;
        }

        if (product.category === "roupas") {
          const hasSize = product.clothingSizes.some(
            (size) => size.id === adjustment.sizeId
          );
          if (!hasSize) invalidVariants.push(`${product.name} (tamanho nao encontrado)`);
          continue;
        }

        invalidVariants.push(`${product.name} (sem variacao de tamanho)`);
      }

      if (missingProducts.length > 0 || invalidVariants.length > 0) {
        return {
          status: "stock_mapping_error" as const,
          missingProducts: Array.from(new Set(missingProducts)),
          invalidVariants: Array.from(new Set(invalidVariants)),
        };
      }

      const now = new Date();
      const stockLogsToCreate: Array<{
        id: string;
        storeId: string;
        productId: string;
        productName: string;
        delta: number;
        reason: string;
        createdAt: Date;
      }> = [];

      for (const adjustment of stockAdjustments) {
        const product = productById.get(adjustment.productId)!;

        if (adjustment.sizeId && product.category === "tenis") {
          const size = product.tennisSizes.find((item) => item.id === adjustment.sizeId)!;

          await tx.tennisSize.update({
            where: { id: size.id },
            data: {
              stock: { increment: adjustment.qty },
              updatedAt: now,
            },
          });

          await tx.product.update({
            where: { id: product.id },
            data: {
              stock: { increment: adjustment.qty },
              updatedAt: now,
            },
          });

          stockLogsToCreate.push({
            id: crypto.randomUUID(),
            storeId,
            productId: product.id,
            productName: `${product.name} Tam ${size.number}`,
            delta: adjustment.qty,
            reason: `Cancelamento da venda ${sale.id}`,
            createdAt: now,
          });
          continue;
        }

        if (adjustment.sizeId && product.category === "roupas") {
          const size = product.clothingSizes.find((item) => item.id === adjustment.sizeId)!;

          await tx.clothingSize.update({
            where: { id: size.id },
            data: {
              stock: { increment: adjustment.qty },
              updatedAt: now,
            },
          });

          await tx.product.update({
            where: { id: product.id },
            data: {
              stock: { increment: adjustment.qty },
              updatedAt: now,
            },
          });

          stockLogsToCreate.push({
            id: crypto.randomUUID(),
            storeId,
            productId: product.id,
            productName: `${product.name} Tam ${size.number}`,
            delta: adjustment.qty,
            reason: `Cancelamento da venda ${sale.id}`,
            createdAt: now,
          });
          continue;
        }

        await tx.product.update({
          where: { id: product.id },
          data: {
            stock: { increment: adjustment.qty },
            updatedAt: now,
          },
        });

        stockLogsToCreate.push({
          id: crypto.randomUUID(),
          storeId,
          productId: product.id,
          productName: product.name,
          delta: adjustment.qty,
          reason: `Cancelamento da venda ${sale.id}`,
          createdAt: now,
        });
      }

      if (fiadoReceivable) {
        if (fiadoReceivable.customerId && fiadoReceivable.outstandingCents > 0) {
          await tx.financialCustomer.update({
            where: { id: fiadoReceivable.customerId },
            data: {
              fiadoBalanceCents: {
                decrement: fiadoReceivable.outstandingCents,
              },
            },
          });
        }

        await tx.accountsReceivable.delete({
          where: { id: fiadoReceivable.id },
        });
      }

      const accountBalanceAdjustments = new Map<string, number>();
      for (const entry of financialEntries) {
        if (!entryAffectsAccount(entry) || !entry.accountId) continue;
        const signedAmount = entrySignedAmountCents(entry.direction, entry.amountCents);
        accountBalanceAdjustments.set(
          entry.accountId,
          (accountBalanceAdjustments.get(entry.accountId) ?? 0) - signedAmount
        );
      }

      for (const [accountId, delta] of accountBalanceAdjustments.entries()) {
        if (!delta) continue;
        await tx.financialAccount.updateMany({
          where: {
            id: accountId,
            storeId,
          },
          data: {
            currentBalanceCents: {
              increment: delta,
            },
          },
        });
      }

      if (financialEntries.length > 0) {
        await tx.financialEntry.deleteMany({
          where: {
            id: { in: financialEntries.map((entry) => entry.id) },
          },
        });
      }

      await tx.notification.deleteMany({
        where: {
          storeId,
          saleId: sale.id,
        },
      });

      if (stockLogsToCreate.length > 0) {
        await tx.stockLog.createMany({
          data: stockLogsToCreate,
          skipDuplicates: true,
        });
      }

      await tx.sale.delete({
        where: { id: sale.id },
      });

      return {
        status: "ok" as const,
        restoredProducts: stockAdjustments.length,
        restoredItems: stockAdjustments.reduce(
          (sum, adjustment) => sum + adjustment.qty,
          0
        ),
      };
    });

    if (result.status === "not_found") {
      res.status(404).json({ error: "Venda não encontrada" });
      return;
    }

    if (result.status === "fiado_already_settled") {
      res.status(409).json({
        error:
          "Não é possível cancelar esta venda porque o fiado já possui baixa financeira. Estorne os recebimentos antes de cancelar.",
      });
      return;
    }

    if (result.status === "stock_mapping_error") {
      const details = [
        result.missingProducts.length > 0
          ? `Produtos ausentes: ${result.missingProducts.join(", ")}`
          : null,
        result.invalidVariants.length > 0
          ? `Variações inválidas: ${result.invalidVariants.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      res.status(409).json({
        error: `Não foi possível restaurar o estoque desta venda. ${details}`,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      saleId,
      restoredProducts: result.restoredProducts,
      restoredItems: result.restoredItems,
    });
  } catch (e) {
    console.error("Report cancel sale error:", e);
    res.status(500).json({ error: String(e) });
  }
});

reportRouter.get("/top-products", async (req, res) => {
  try {
    const storeId = getStoreId(req);
    if (!storeId) {
      res.status(400).json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return;
    }
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const startDate = start ? new Date(start) : new Date(0);
    const endDate = end ? new Date(end) : new Date();

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          storeId,
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
