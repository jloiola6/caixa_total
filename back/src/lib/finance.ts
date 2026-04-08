import {
  FinancialBasis,
  FinancialCounterpartyType,
  FinancialDirection,
  FinancialEntryOrigin,
  FinancialEntryStatus,
  FiscalRuleType,
  PaymentMethod,
  PayrollEventType,
  Prisma,
  ProductCategory,
} from "@prisma/client";
import { prisma } from "../db.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

const VARIANT_SEPARATOR = "::";

export type FinanceContext = {
  costCenterId: string;
  processId: string;
  accountId: string;
};

type EnsureContextOptions = {
  defaultAccountName?: string;
};

type CreateFinancialEntryInput = {
  storeId: string;
  origin: FinancialEntryOrigin;
  basis: FinancialBasis;
  direction: FinancialDirection;
  amountCents: number;
  competenceDate: Date;
  settlementDate?: Date | null;
  status?: FinancialEntryStatus;
  description?: string | null;
  costCenterId: string;
  processId: string;
  accountId?: string | null;
  counterpartyType?: FinancialCounterpartyType | null;
  counterpartyLabel?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  sourceRef: string;
  createdByUserId: string;
  approvedByUserId?: string | null;
  payableId?: string | null;
  receivableId?: string | null;
  fiscalDocumentId?: string | null;
};

type UpsertSalePostingInput = {
  saleId: string;
  storeId: string;
  actorUserId: string;
};

function normalizeProductId(productId: string): string {
  const splitIndex = productId.indexOf(VARIANT_SEPARATOR);
  if (splitIndex <= 0) return productId;
  return productId.slice(0, splitIndex);
}

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function entryBalanceDelta(direction: FinancialDirection, amountCents: number): number {
  const normalized = toCents(amountCents);
  return direction === "entrada" ? normalized : -normalized;
}

function entryAffectsAccount(entry: {
  basis: FinancialBasis;
  status: FinancialEntryStatus;
  accountId: string | null;
  settlementDate: Date | null;
}): boolean {
  if (!entry.accountId) return false;
  if (!entry.settlementDate) return false;
  if (entry.basis !== "caixa") return false;
  return entry.status === "approved" || entry.status === "reconciled";
}

async function applyAccountBalanceDelta(
  tx: DbClient,
  accountId: string,
  deltaCents: number
): Promise<void> {
  if (!deltaCents) return;
  await tx.financialAccount.update({
    where: { id: accountId },
    data: {
      currentBalanceCents: {
        increment: deltaCents,
      },
    },
  });
}

async function createEntryAudit(
  tx: DbClient,
  input: {
    financialEntryId: string;
    action: string;
    notes?: string | null;
    performedByUserId: string;
    previousStatus?: FinancialEntryStatus | null;
    nextStatus?: FinancialEntryStatus | null;
  }
): Promise<void> {
  await tx.financialEntryAudit.create({
    data: {
      financialEntryId: input.financialEntryId,
      action: input.action,
      notes: input.notes ?? null,
      performedByUserId: input.performedByUserId,
      previousStatus: input.previousStatus ?? null,
      nextStatus: input.nextStatus ?? null,
    },
  });
}

export async function ensureDefaultFinanceContext(
  tx: DbClient,
  storeId: string,
  options?: EnsureContextOptions
): Promise<FinanceContext> {
  const defaultAccountName = options?.defaultAccountName ?? "Caixa principal";

  let costCenter = await tx.costCenter.findFirst({
    where: { storeId, code: "GERAL" },
    select: { id: true },
  });

  if (!costCenter) {
    costCenter = await tx.costCenter.create({
      data: {
        storeId,
        code: "GERAL",
        name: "Geral",
        active: true,
      },
      select: { id: true },
    });
  }

  let process = await tx.operationalProcess.findFirst({
    where: { storeId, code: "OPERACIONAL" },
    select: { id: true },
  });

  if (!process) {
    process = await tx.operationalProcess.create({
      data: {
        storeId,
        code: "OPERACIONAL",
        name: "Operacional",
        active: true,
      },
      select: { id: true },
    });
  }

  let account = await tx.financialAccount.findFirst({
    where: { storeId, name: defaultAccountName },
    select: { id: true },
  });

  if (!account) {
    account = await tx.financialAccount.create({
      data: {
        storeId,
        name: defaultAccountName,
        type: "cash",
        currency: "BRL",
        openingBalanceCents: 0,
        currentBalanceCents: 0,
        active: true,
      },
      select: { id: true },
    });
  }

  return {
    costCenterId: costCenter.id,
    processId: process.id,
    accountId: account.id,
  };
}

export async function createFinancialEntry(
  tx: DbClient,
  input: CreateFinancialEntryInput
): Promise<{ entry: Prisma.FinancialEntryGetPayload<{}>; created: boolean }> {
  const amountCents = toCents(input.amountCents);
  if (amountCents <= 0) {
    throw new Error("amountCents deve ser maior que zero");
  }

  const existing = await tx.financialEntry.findUnique({
    where: {
      storeId_sourceRef: {
        storeId: input.storeId,
        sourceRef: input.sourceRef,
      },
    },
  });

  if (existing) {
    return { entry: existing, created: false };
  }

  const status = input.status ?? "draft";
  const now = new Date();

  const created = await tx.financialEntry.create({
    data: {
      storeId: input.storeId,
      origin: input.origin,
      basis: input.basis,
      direction: input.direction,
      amountCents,
      competenceDate: input.competenceDate,
      settlementDate: input.settlementDate ?? null,
      status,
      description: input.description ?? null,
      costCenterId: input.costCenterId,
      processId: input.processId,
      accountId: input.accountId ?? null,
      counterpartyType: input.counterpartyType ?? null,
      counterpartyLabel: input.counterpartyLabel ?? null,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      employeeId: input.employeeId ?? null,
      sourceRef: input.sourceRef,
      createdByUserId: input.createdByUserId,
      approvedByUserId: status === "approved" || status === "reconciled"
        ? input.approvedByUserId ?? input.createdByUserId
        : null,
      approvedAt: status === "approved" || status === "reconciled" ? now : null,
      reconciledAt: status === "reconciled" ? now : null,
      payableId: input.payableId ?? null,
      receivableId: input.receivableId ?? null,
      fiscalDocumentId: input.fiscalDocumentId ?? null,
    },
  });

  await createEntryAudit(tx, {
    financialEntryId: created.id,
    action: "created",
    performedByUserId: input.createdByUserId,
    nextStatus: created.status,
  });

  if (entryAffectsAccount(created) && created.accountId) {
    await applyAccountBalanceDelta(
      tx,
      created.accountId,
      entryBalanceDelta(created.direction, created.amountCents)
    );
  }

  return { entry: created, created: true };
}

export async function transitionFinancialEntryStatus(
  tx: DbClient,
  input: {
    storeId: string;
    entryId: string;
    nextStatus: FinancialEntryStatus;
    performedByUserId: string;
    notes?: string | null;
  }
): Promise<Prisma.FinancialEntryGetPayload<{}>> {
  const current = await tx.financialEntry.findFirst({
    where: {
      id: input.entryId,
      storeId: input.storeId,
    },
  });

  if (!current) {
    throw new Error("Lançamento financeiro não encontrado");
  }

  if (current.status === input.nextStatus) {
    return current;
  }

  const previousAffectsAccount = entryAffectsAccount(current);
  const now = new Date();

  const updated = await tx.financialEntry.update({
    where: { id: current.id },
    data: {
      status: input.nextStatus,
      approvedByUserId:
        input.nextStatus === "approved" || input.nextStatus === "reconciled"
          ? input.performedByUserId
          : current.approvedByUserId,
      approvedAt:
        input.nextStatus === "approved" || input.nextStatus === "reconciled"
          ? current.approvedAt ?? now
          : current.approvedAt,
      reconciledAt:
        input.nextStatus === "reconciled"
          ? now
          : input.nextStatus === "approved"
            ? null
            : current.reconciledAt,
      canceledAt: input.nextStatus === "canceled" ? now : null,
    },
  });

  const nextAffectsAccount = entryAffectsAccount(updated);

  if (current.accountId && previousAffectsAccount && !nextAffectsAccount) {
    await applyAccountBalanceDelta(
      tx,
      current.accountId,
      -entryBalanceDelta(current.direction, current.amountCents)
    );
  }

  if (updated.accountId && !previousAffectsAccount && nextAffectsAccount) {
    await applyAccountBalanceDelta(
      tx,
      updated.accountId,
      entryBalanceDelta(updated.direction, updated.amountCents)
    );
  }

  await createEntryAudit(tx, {
    financialEntryId: updated.id,
    action: "status_changed",
    performedByUserId: input.performedByUserId,
    notes: input.notes ?? null,
    previousStatus: current.status,
    nextStatus: updated.status,
  });

  return updated;
}

async function getOrCreateFiadoCustomer(
  tx: DbClient,
  input: {
    storeId: string;
    customerName?: string | null;
    customerPhone?: string | null;
  }
): Promise<string> {
  const normalizedName = (input.customerName ?? "").trim() || "Cliente Fiado";
  const normalizedPhone = (input.customerPhone ?? "").trim() || null;

  const existing = await tx.financialCustomer.findFirst({
    where: {
      storeId: input.storeId,
      name: normalizedName,
      phone: normalizedPhone,
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await tx.financialCustomer.create({
    data: {
      storeId: input.storeId,
      name: normalizedName,
      phone: normalizedPhone,
    },
    select: { id: true },
  });

  return created.id;
}

async function applyTaxRulesForSale(
  tx: DbClient,
  input: {
    saleId: string;
    storeId: string;
    actorUserId: string;
    context: FinanceContext;
    saleCreatedAt: Date;
    saleTotalCents: number;
    payments: Array<{ method: PaymentMethod; amountCents: number }>;
  }
): Promise<void> {
  const rules = await tx.fiscalTaxRule.findMany({
    where: {
      storeId: input.storeId,
      active: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (rules.length === 0) return;

  for (const rule of rules) {
    if (rule.rateBps <= 0) continue;

    if (rule.appliesTo === "sale") {
      const amountCents = Math.floor((input.saleTotalCents * rule.rateBps) / 10000);
      if (amountCents <= 0) continue;

      await createFinancialEntry(tx, {
        storeId: input.storeId,
        origin: rule.type === "imposto" ? "tax" : "sale_payment",
        basis: "competencia",
        direction: "saida",
        amountCents,
        competenceDate: input.saleCreatedAt,
        settlementDate: null,
        status: "approved",
        description: `${rule.type === "imposto" ? "Imposto" : "Taxa"}: ${rule.name}`,
        costCenterId: input.context.costCenterId,
        processId: input.context.processId,
        sourceRef: `sale:${input.saleId}:tax-rule:${rule.id}:sale`,
        createdByUserId: input.actorUserId,
        approvedByUserId: input.actorUserId,
      });
      continue;
    }

    if (rule.appliesTo === "payment") {
      for (const payment of input.payments) {
        if (rule.paymentMethod && rule.paymentMethod !== payment.method) continue;
        if (payment.method === "fiado") continue;

        const amountCents = Math.floor((payment.amountCents * rule.rateBps) / 10000);
        if (amountCents <= 0) continue;

        const basis: FinancialBasis = rule.type === "taxa" ? "caixa" : "competencia";
        await createFinancialEntry(tx, {
          storeId: input.storeId,
          origin: rule.type === "imposto" ? "tax" : "sale_payment",
          basis,
          direction: "saida",
          amountCents,
          competenceDate: input.saleCreatedAt,
          settlementDate: basis === "caixa" ? input.saleCreatedAt : null,
          status: "approved",
          description: `${rule.type === "imposto" ? "Imposto" : "Taxa"}: ${rule.name} (${payment.method})`,
          costCenterId: input.context.costCenterId,
          processId: input.context.processId,
          accountId: basis === "caixa" ? input.context.accountId : null,
          sourceRef: `sale:${input.saleId}:tax-rule:${rule.id}:payment:${payment.method}`,
          createdByUserId: input.actorUserId,
          approvedByUserId: input.actorUserId,
        });
      }
    }
  }
}

function settlementMethodDescription(method: PaymentMethod): string {
  if (method === "credito") return "Cartão de crédito";
  if (method === "debito") return "Cartão de débito";
  if (method === "pix") return "PIX";
  if (method === "fiado") return "Fiado";
  return "Dinheiro";
}

export async function upsertSaleFinancialPosting(
  tx: DbClient,
  input: UpsertSalePostingInput
): Promise<void> {
  const sale = await tx.sale.findFirst({
    where: {
      id: input.saleId,
      storeId: input.storeId,
    },
    include: {
      items: true,
      payments: true,
    },
  });

  if (!sale) return;

  const context = await ensureDefaultFinanceContext(tx, input.storeId);
  const createdAt = sale.createdAt;

  await createFinancialEntry(tx, {
    storeId: input.storeId,
    origin: "sale",
    basis: "competencia",
    direction: "entrada",
    amountCents: sale.totalCents,
    competenceDate: createdAt,
    settlementDate: null,
    status: "approved",
    description: `Receita da venda ${sale.id}`,
    costCenterId: context.costCenterId,
    processId: context.processId,
    sourceRef: `sale:${sale.id}:revenue`,
    createdByUserId: input.actorUserId,
    approvedByUserId: input.actorUserId,
  });

  const baseProductIds = Array.from(
    new Set(sale.items.map((item) => normalizeProductId(item.productId)))
  );

  const products = baseProductIds.length
    ? await tx.product.findMany({
        where: {
          storeId: input.storeId,
          id: { in: baseProductIds },
        },
        select: {
          id: true,
          costCents: true,
          category: true,
        },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, product]));

  let cogsCents = 0;
  for (const item of sale.items) {
    const baseProduct = productById.get(normalizeProductId(item.productId));
    if (!baseProduct) continue;
    const unitCost = toCents(baseProduct.costCents ?? 0);
    cogsCents += unitCost * Math.max(0, item.qty);
  }

  if (cogsCents > 0) {
    await createFinancialEntry(tx, {
      storeId: input.storeId,
      origin: "sale",
      basis: "competencia",
      direction: "saida",
      amountCents: cogsCents,
      competenceDate: createdAt,
      settlementDate: null,
      status: "approved",
      description: `CMV da venda ${sale.id}`,
      costCenterId: context.costCenterId,
      processId: context.processId,
      sourceRef: `sale:${sale.id}:cogs`,
      createdByUserId: input.actorUserId,
      approvedByUserId: input.actorUserId,
    });
  }

  const fiadoPayment = sale.payments.find((payment) => payment.method === "fiado");

  for (const payment of sale.payments) {
    if (payment.method === "fiado") continue;

    await createFinancialEntry(tx, {
      storeId: input.storeId,
      origin: "sale_payment",
      basis: "caixa",
      direction: "entrada",
      amountCents: payment.amountCents,
      competenceDate: createdAt,
      settlementDate: createdAt,
      status: "approved",
      description: `Recebimento da venda ${sale.id} (${settlementMethodDescription(payment.method)})`,
      costCenterId: context.costCenterId,
      processId: context.processId,
      accountId: context.accountId,
      sourceRef: `sale:${sale.id}:payment:${payment.method}`,
      createdByUserId: input.actorUserId,
      approvedByUserId: input.actorUserId,
    });
  }

  if (fiadoPayment && fiadoPayment.amountCents > 0) {
    const fiadoSourceRef = `sale:${sale.id}:fiado`;
    const existingFiadoEntry = await tx.financialEntry.findUnique({
      where: {
        storeId_sourceRef: {
          storeId: input.storeId,
          sourceRef: fiadoSourceRef,
        },
      },
      select: { id: true },
    });

    if (!existingFiadoEntry) {
      const customerId = await getOrCreateFiadoCustomer(tx, {
        storeId: input.storeId,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
      });

      const receivable = await tx.accountsReceivable.create({
        data: {
          storeId: input.storeId,
          customerId,
          description: `Venda fiado ${sale.id}`,
          amountCents: fiadoPayment.amountCents,
          outstandingCents: fiadoPayment.amountCents,
          dueDate: null,
          competenceDate: createdAt,
          status: "open",
          costCenterId: context.costCenterId,
          processId: context.processId,
          createdByUserId: input.actorUserId,
          approvedByUserId: input.actorUserId,
          approvedAt: new Date(),
          notes: "Gerado automaticamente pela venda fiado",
        },
      });

      await createFinancialEntry(tx, {
        storeId: input.storeId,
        origin: "fiado_receivable",
        basis: "competencia",
        direction: "entrada",
        amountCents: fiadoPayment.amountCents,
        competenceDate: createdAt,
        settlementDate: null,
        status: "approved",
        description: `Conta a receber (fiado) da venda ${sale.id}`,
        costCenterId: context.costCenterId,
        processId: context.processId,
        sourceRef: fiadoSourceRef,
        customerId,
        receivableId: receivable.id,
        createdByUserId: input.actorUserId,
        approvedByUserId: input.actorUserId,
      });

      await tx.financialCustomer.update({
        where: { id: customerId },
        data: {
          fiadoBalanceCents: {
            increment: fiadoPayment.amountCents,
          },
        },
      });
    }
  }

  await applyTaxRulesForSale(tx, {
    saleId: sale.id,
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    context,
    saleCreatedAt: createdAt,
    saleTotalCents: sale.totalCents,
    payments: sale.payments,
  });

  await tx.sale.update({
    where: { id: sale.id },
    data: {
      financialPostedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function runSalesBackfill(
  storeId: string,
  actorUserId: string
): Promise<{ processed: number }> {
  const sales = await prisma.sale.findMany({
    where: { storeId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let processed = 0;
  for (const sale of sales) {
    await prisma.$transaction(async (tx) => {
      await upsertSaleFinancialPosting(tx, {
        saleId: sale.id,
        storeId,
        actorUserId,
      });
    });
    processed += 1;
  }

  return { processed };
}

export async function captureInventoryValuationSnapshot(
  tx: DbClient,
  storeId: string
): Promise<void> {
  const products = await tx.product.findMany({
    where: { storeId },
    select: {
      stock: true,
      priceCents: true,
      costCents: true,
      tennisSizes: { select: { stock: true } },
      clothingSizes: { select: { stock: true } },
      category: true,
    },
  });

  let totalCostCents = 0;
  let totalRetailCents = 0;
  let itemsCount = 0;

  for (const product of products) {
    let qty = product.stock;

    if (product.category === ProductCategory.tenis && product.tennisSizes.length > 0) {
      qty = product.tennisSizes.reduce((sum, size) => sum + Math.max(0, size.stock), 0);
    } else if (product.category === ProductCategory.roupas && product.clothingSizes.length > 0) {
      qty = product.clothingSizes.reduce((sum, size) => sum + Math.max(0, size.stock), 0);
    }

    const safeQty = Math.max(0, qty);
    if (safeQty <= 0) continue;

    const costCents = toCents(product.costCents ?? 0);
    const retailCents = toCents(product.priceCents);

    totalCostCents += costCents * safeQty;
    totalRetailCents += retailCents * safeQty;
    itemsCount += safeQty;
  }

  await tx.inventoryValuationSnapshot.create({
    data: {
      storeId,
      totalCostCents,
      totalRetailCents,
      totalMarginCents: totalRetailCents - totalCostCents,
      itemsCount,
      metaJson: JSON.stringify({ method: "weighted-average-simplified" }),
    },
  });
}

export async function refreshFinancialAlerts(
  tx: DbClient,
  storeId: string
): Promise<void> {
  const today = new Date();
  const inThreeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [duePayables, overduePayables, overdueReceivables, negativeAccounts] = await Promise.all([
    tx.accountsPayable.findMany({
      where: {
        storeId,
        status: { in: ["open", "partial"] },
        dueDate: { gte: today, lte: inThreeDays },
      },
      select: { id: true, description: true, dueDate: true },
    }),
    tx.accountsPayable.findMany({
      where: {
        storeId,
        status: { in: ["open", "partial", "overdue"] },
        dueDate: { lt: today },
      },
      select: { id: true, description: true, dueDate: true },
    }),
    tx.accountsReceivable.findMany({
      where: {
        storeId,
        status: { in: ["open", "partial", "overdue"] },
        dueDate: { not: null, lt: today },
      },
      select: { id: true, description: true, dueDate: true },
    }),
    tx.financialAccount.findMany({
      where: {
        storeId,
        currentBalanceCents: { lt: 0 },
      },
      select: { id: true, name: true, currentBalanceCents: true },
    }),
  ]);

  await tx.financialAlert.updateMany({
    where: {
      storeId,
      status: "open",
    },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
    },
  });

  for (const payable of duePayables) {
    await tx.financialAlert.create({
      data: {
        storeId,
        type: "payable_due",
        status: "open",
        title: "Conta a pagar vencendo",
        message: `${payable.description} vence em breve`,
        dueDate: payable.dueDate,
        relatedEntityType: "accounts_payable",
        relatedEntityId: payable.id,
      },
    });
  }

  for (const payable of overduePayables) {
    await tx.financialAlert.create({
      data: {
        storeId,
        type: "payable_overdue",
        status: "open",
        title: "Conta a pagar vencida",
        message: `${payable.description} está vencida`,
        dueDate: payable.dueDate,
        relatedEntityType: "accounts_payable",
        relatedEntityId: payable.id,
      },
    });
  }

  for (const receivable of overdueReceivables) {
    await tx.financialAlert.create({
      data: {
        storeId,
        type: "receivable_overdue",
        status: "open",
        title: "Conta a receber vencida",
        message: `${receivable.description} está vencida`,
        dueDate: receivable.dueDate,
        relatedEntityType: "accounts_receivable",
        relatedEntityId: receivable.id,
      },
    });
  }

  for (const account of negativeAccounts) {
    await tx.financialAlert.create({
      data: {
        storeId,
        type: "cash_negative",
        status: "open",
        title: "Saldo negativo de conta",
        message: `${account.name} está com saldo negativo`,
        relatedEntityType: "financial_account",
        relatedEntityId: account.id,
      },
    });
  }
}

export function parsePayrollEventType(value: string): PayrollEventType {
  const normalized = value.trim().toLowerCase();
  if (["provento", "desconto", "encargo", "beneficio"].includes(normalized)) {
    return normalized as PayrollEventType;
  }
  return "provento";
}

export function parsePaymentMethod(value: string): PaymentMethod {
  const normalized = value.trim().toLowerCase();
  if (["dinheiro", "credito", "debito", "pix", "fiado"].includes(normalized)) {
    return normalized as PaymentMethod;
  }
  return "dinheiro";
}

export function parseFiscalRuleType(value: string): FiscalRuleType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "taxa") return "taxa";
  return "imposto";
}

export function parseProductCategory(value: string | null | undefined): ProductCategory | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["roupas", "tenis", "controles", "eletronicos", "diversos"].includes(normalized)) {
    return normalized as ProductCategory;
  }
  return null;
}

export function normalizeCpfCnpj(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\D+/g, "").trim();
  return normalized || null;
}
