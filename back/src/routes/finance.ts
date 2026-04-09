import { Router, type Request, type Response } from "express";
import {
  AccountsPayableStatus,
  AccountsReceivableStatus,
  CashSessionStatus,
  FinancialBasis,
  FinancialDirection,
  FinancialEntryOrigin,
  FinancialEntryStatus,
  ReconciliationImportFormat,
  ReconciliationMatchStatus,
  RecurringInterval,
} from "@prisma/client";
import { prisma } from "../db.js";
import { authMiddleware, requireStoreUserOrSuperAdmin } from "../middleware/auth.js";
import {
  captureInventoryValuationSnapshot,
  createFinancialEntry,
  ensureDefaultFinanceContext,
  normalizeCpfCnpj,
  parseFiscalRuleType,
  parsePaymentMethod,
  parsePayrollEventType,
  parseProductCategory,
  refreshFinancialAlerts,
  runSalesBackfill,
  transitionFinancialEntryStatus,
} from "../lib/finance.js";

export const financeRouter = Router();
financeRouter.use(authMiddleware);
financeRouter.use(requireStoreUserOrSuperAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

type AuthenticatedRequest = Request & {
  user: {
    userId: string;
    role: "SUPER_ADMIN" | "STORE_USER";
    storeId: string | null;
  };
};

function getStoreId(req: AuthenticatedRequest, res: Response): string | null {
  const queryStoreId = typeof req.query.storeId === "string" ? req.query.storeId : null;
  if (req.user.role === "SUPER_ADMIN") {
    if (!queryStoreId) {
      res.status(400).json({ error: "storeId é obrigatório (query storeId para super admin)" });
      return null;
    }
    return queryStoreId;
  }

  if (!req.user.storeId) {
    res.status(400).json({ error: "Usuário sem storeId" });
    return null;
  }

  return req.user.storeId;
}

financeRouter.use(async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    if (authReq.user.role !== "STORE_USER") {
      next();
      return;
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { financeModuleEnabled: true },
    });

    if (!store) {
      res.status(404).json({ error: "Loja não encontrada" });
      return;
    }

    if (!store.financeModuleEnabled) {
      res.status(403).json({ error: "Módulo financeiro desativado para esta loja" });
      return;
    }

    next();
  } catch (e) {
    console.error("Finance module policy check error:", e);
    res.status(500).json({ error: "Erro ao validar política do módulo financeiro" });
  }
});

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string") return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function toCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function buildCsv(rows: string[][]): string {
  const escape = (value: string): string => {
    if (/[",;\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  return rows.map((row) => row.map((cell) => escape(cell)).join(",")).join("\n");
}

function parseFinancialStatus(value: unknown): FinancialEntryStatus | null {
  if (typeof value !== "string") return null;
  if (["draft", "approved", "reconciled", "canceled"].includes(value)) {
    return value as FinancialEntryStatus;
  }
  return null;
}

function parseFinancialBasis(value: unknown): FinancialBasis | null {
  if (typeof value !== "string") return null;
  if (value === "caixa" || value === "competencia") return value;
  return null;
}

function parseFinancialDirection(value: unknown): FinancialDirection | null {
  if (typeof value !== "string") return null;
  if (value === "entrada" || value === "saida") return value;
  return null;
}

function parseFinancialOrigin(value: unknown): FinancialEntryOrigin | null {
  if (typeof value !== "string") return null;
  const allowed: FinancialEntryOrigin[] = [
    "sale",
    "sale_payment",
    "fiado_receivable",
    "receivable_settlement",
    "payable",
    "payable_settlement",
    "payroll",
    "tax",
    "adjustment",
    "cash_movement",
    "reconciliation",
    "fiscal_import",
    "recurring",
  ];
  if (allowed.includes(value as FinancialEntryOrigin)) return value as FinancialEntryOrigin;
  return null;
}

function parseCounterpartyType(
  value: unknown
): "customer" | "supplier" | "employee" | "other" | null {
  if (typeof value !== "string") return null;
  if (["customer", "supplier", "employee", "other"].includes(value)) {
    return value as "customer" | "supplier" | "employee" | "other";
  }
  return null;
}

function signedAmount(direction: FinancialDirection, amountCents: number): number {
  return direction === "entrada" ? amountCents : -amountCents;
}

function normalizePayableStatus(
  outstandingCents: number,
  dueDate: Date,
  totalAmountCents: number
): AccountsPayableStatus {
  if (outstandingCents <= 0) return "paid";
  const now = new Date();
  if (dueDate.getTime() < now.getTime()) return "overdue";
  if (outstandingCents < totalAmountCents) return "partial";
  return "open";
}

function normalizeReceivableStatus(
  outstandingCents: number,
  dueDate: Date | null,
  totalAmountCents: number
): AccountsReceivableStatus {
  if (outstandingCents <= 0) return "paid";
  if (dueDate && dueDate.getTime() < Date.now()) return "overdue";
  if (outstandingCents < totalAmountCents) return "partial";
  return "open";
}

function addByInterval(date: Date, interval: RecurringInterval): Date {
  if (interval === "weekly") return new Date(date.getTime() + 7 * DAY_MS);
  if (interval === "monthly") return new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return new Date(date.getFullYear() + 1, date.getMonth(), date.getDate());
}

function parseCsvRows(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[;,]/).map((value) => value.trim()));
}

function parseDateFromString(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const iso = new Date(normalized);
  if (!Number.isNaN(iso.getTime())) return iso;

  const ddmmyyyy = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function parseCurrencyToCents(value: string): number {
  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator =
    lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;

  let normalized = cleaned;
  if (decimalSeparator) {
    if (decimalSeparator === ",") {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else {
    normalized = normalized.replace(/[.,]/g, "");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function parseOfxDate(raw: string): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

financeRouter.get("/bootstrap", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const result = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      const [costCenters, processes, accounts, taxRules] = await Promise.all([
        tx.costCenter.findMany({ where: { storeId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
        tx.operationalProcess.findMany({ where: { storeId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
        tx.financialAccount.findMany({ where: { storeId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
        tx.fiscalTaxRule.findMany({ where: { storeId }, orderBy: { name: "asc" } }),
      ]);

      return {
        defaults,
        costCenters,
        processes,
        accounts,
        taxRules,
      };
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance bootstrap error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/cost-centers", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const items = await prisma.costCenter.findMany({
      where: { storeId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    res.status(200).json(items);
  } catch (e) {
    console.error("Finance cost-centers list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/cost-centers", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      code?: string;
      name?: string;
      active?: boolean;
    };

    const code = (body.code ?? "").trim().toUpperCase();
    const name = (body.name ?? "").trim();

    if (!code || !name) {
      res.status(400).json({ error: "code e name são obrigatórios" });
      return;
    }

    const item = await prisma.costCenter.create({
      data: {
        storeId,
        code,
        name,
        active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    res.status(201).json(item);
  } catch (e) {
    console.error("Finance cost-center create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/processes", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const items = await prisma.operationalProcess.findMany({
      where: { storeId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    res.status(200).json(items);
  } catch (e) {
    console.error("Finance processes list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/processes", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      code?: string;
      name?: string;
      active?: boolean;
    };

    const code = (body.code ?? "").trim().toUpperCase();
    const name = (body.name ?? "").trim();

    if (!code || !name) {
      res.status(400).json({ error: "code e name são obrigatórios" });
      return;
    }

    const item = await prisma.operationalProcess.create({
      data: {
        storeId,
        code,
        name,
        active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    res.status(201).json(item);
  } catch (e) {
    console.error("Finance process create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/accounts", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const items = await prisma.financialAccount.findMany({
      where: { storeId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    res.status(200).json(items);
  } catch (e) {
    console.error("Finance accounts list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/accounts", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      type?: string;
      openingBalanceCents?: number;
      active?: boolean;
    };

    const name = (body.name ?? "").trim();
    const type = (body.type ?? "cash").trim() || "cash";

    if (!name) {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }

    const openingBalanceCents = toCents(body.openingBalanceCents ?? 0);

    const item = await prisma.financialAccount.create({
      data: {
        storeId,
        name,
        type,
        openingBalanceCents,
        currentBalanceCents: openingBalanceCents,
        active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    res.status(201).json(item);
  } catch (e) {
    console.error("Finance account create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/entries", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = parseDate(req.query.start, new Date(Date.now() - 30 * DAY_MS));
    const end = parseDate(req.query.end, new Date());
    const status = parseFinancialStatus(req.query.status);
    const basis = parseFinancialBasis(req.query.basis);
    const origin = parseFinancialOrigin(req.query.origin);
    const direction = parseFinancialDirection(req.query.direction);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const costCenterId = typeof req.query.costCenterId === "string" ? req.query.costCenterId : undefined;
    const processId = typeof req.query.processId === "string" ? req.query.processId : undefined;
    const limit = Math.min(Math.max(toInt(req.query.limit, 100), 1), 500);

    const entries = await prisma.financialEntry.findMany({
      where: {
        storeId,
        ...(status ? { status } : {}),
        ...(basis ? { basis } : {}),
        ...(origin ? { origin } : {}),
        ...(direction ? { direction } : {}),
        ...(accountId ? { accountId } : {}),
        ...(costCenterId ? { costCenterId } : {}),
        ...(processId ? { processId } : {}),
        OR: [
          {
            competenceDate: {
              gte: startOfDay(start),
              lte: endOfDay(end),
            },
          },
          {
            settlementDate: {
              gte: startOfDay(start),
              lte: endOfDay(end),
            },
          },
        ],
      },
      include: {
        costCenter: true,
        process: true,
        account: true,
      },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    res.status(200).json(entries);
  } catch (e) {
    console.error("Finance entries list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/entries", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      origin?: string;
      basis?: string;
      direction?: string;
      amountCents?: number;
      competenceDate?: string;
      settlementDate?: string | null;
      status?: string;
      description?: string;
      costCenterId?: string;
      processId?: string;
      accountId?: string;
      sourceRef?: string;
      counterpartyType?: string;
      counterpartyLabel?: string;
    };

    const origin = parseFinancialOrigin(body.origin ?? "adjustment") ?? "adjustment";
    const basis = parseFinancialBasis(body.basis ?? "caixa") ?? "caixa";
    const direction = parseFinancialDirection(body.direction ?? "entrada") ?? "entrada";
    const status = parseFinancialStatus(body.status ?? "draft") ?? "draft";
    const amountCents = toCents(body.amountCents ?? 0);

    if (amountCents <= 0) {
      res.status(400).json({ error: "amountCents deve ser maior que zero" });
      return;
    }

    const competenceDate = parseDate(body.competenceDate, new Date());
    const settlementDate = body.settlementDate ? parseDate(body.settlementDate, new Date()) : null;

    const entry = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      const created = await createFinancialEntry(tx, {
        storeId,
        origin,
        basis,
        direction,
        amountCents,
        competenceDate,
        settlementDate,
        status,
        description: body.description ?? null,
        costCenterId: body.costCenterId ?? defaults.costCenterId,
        processId: body.processId ?? defaults.processId,
        accountId: body.accountId ?? (basis === "caixa" ? defaults.accountId : null),
        sourceRef:
          (body.sourceRef ?? "").trim() ||
          `manual:${authReq.user.userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        counterpartyType: parseCounterpartyType(body.counterpartyType),
        counterpartyLabel: body.counterpartyLabel ?? null,
        createdByUserId: authReq.user.userId,
        approvedByUserId: status === "approved" || status === "reconciled" ? authReq.user.userId : null,
      });

      return created.entry;
    });

    res.status(201).json(entry);
  } catch (e) {
    console.error("Finance entry create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.patch("/entries/:id/status", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const entryId = req.params.id;
    const body = req.body as { status?: string; notes?: string };

    const status = parseFinancialStatus(body.status);
    if (!status) {
      res.status(400).json({ error: "status inválido" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      return transitionFinancialEntryStatus(tx, {
        storeId,
        entryId,
        nextStatus: status,
        performedByUserId: authReq.user.userId,
        notes: body.notes ?? null,
      });
    });

    res.status(200).json(updated);
  } catch (e) {
    console.error("Finance entry status update error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/dashboard", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = startOfDay(parseDate(req.query.start, new Date(Date.now() - 30 * DAY_MS)));
    const end = endOfDay(parseDate(req.query.end, new Date()));

    const result = await prisma.$transaction(async (tx) => {
      await ensureDefaultFinanceContext(tx, storeId);
      await captureInventoryValuationSnapshot(tx, storeId);

      const [entries, latestSnapshot] = await Promise.all([
        tx.financialEntry.findMany({
          where: {
            storeId,
            status: { in: ["approved", "reconciled"] },
            OR: [
              { competenceDate: { gte: start, lte: end } },
              { settlementDate: { gte: start, lte: end } },
            ],
          },
          orderBy: { competenceDate: "asc" },
        }),
        tx.inventoryValuationSnapshot.findFirst({
          where: { storeId },
          orderBy: { capturedAt: "desc" },
        }),
      ]);

      let cashIn = 0;
      let cashOut = 0;
      let competenceIn = 0;
      let competenceOut = 0;

      let grossRevenue = 0;
      let taxes = 0;
      let fees = 0;
      let cogs = 0;
      let payroll = 0;
      let operatingExpenses = 0;

      for (const entry of entries) {
        const amount = entry.amountCents;

        if (entry.basis === "caixa" && entry.settlementDate && entry.settlementDate >= start && entry.settlementDate <= end) {
          if (entry.direction === "entrada") cashIn += amount;
          else cashOut += amount;
        }

        if (entry.basis === "competencia" && entry.competenceDate >= start && entry.competenceDate <= end) {
          if (entry.direction === "entrada") competenceIn += amount;
          else competenceOut += amount;
        }

        if (entry.origin === "sale" && entry.direction === "entrada") {
          grossRevenue += amount;
        }

        if (entry.origin === "tax") {
          taxes += amount;
        }

        if (entry.origin === "sale_payment" && entry.direction === "saida") {
          fees += amount;
        }

        if (entry.origin === "sale" && entry.direction === "saida") {
          cogs += amount;
        }

        if (entry.origin === "payroll") {
          payroll += amount;
        }

        if (
          entry.direction === "saida" &&
          !["sale", "tax", "payroll"].includes(entry.origin)
        ) {
          operatingExpenses += amount;
        }
      }

      const netResult = competenceIn - competenceOut;
      const marginBps = grossRevenue > 0 ? Math.round((netResult * 10000) / grossRevenue) : 0;

      const projectedPayables = await tx.accountsPayable.aggregate({
        where: {
          storeId,
          status: { in: ["open", "partial", "overdue"] },
          dueDate: { gte: start, lte: end },
        },
        _sum: { outstandingCents: true },
      });

      const projectedReceivables = await tx.accountsReceivable.aggregate({
        where: {
          storeId,
          status: { in: ["open", "partial", "overdue"] },
          dueDate: { not: null, gte: start, lte: end },
        },
        _sum: { outstandingCents: true },
      });

      const recurringTemplates = await tx.recurringTemplate.findMany({
        where: {
          storeId,
          active: true,
        },
      });

      let recurringProjectedIn = 0;
      let recurringProjectedOut = 0;
      for (const template of recurringTemplates) {
        let cursor = new Date(template.nextRunDate);
        const hardLimit = end.getTime() + 365 * DAY_MS;

        while (cursor <= end && cursor.getTime() <= hardLimit) {
          if (cursor >= start) {
            if (template.direction === "entrada") recurringProjectedIn += template.amountCents;
            else recurringProjectedOut += template.amountCents;
          }
          cursor = addByInterval(cursor, template.interval);
          if (template.endDate && cursor > template.endDate) break;
        }
      }

      return {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        cash: {
          inCents: cashIn,
          outCents: cashOut,
          netCents: cashIn - cashOut,
        },
        competence: {
          inCents: competenceIn,
          outCents: competenceOut,
          netCents: competenceIn - competenceOut,
        },
        dre: {
          grossRevenueCents: grossRevenue,
          taxesCents: taxes,
          feesCents: fees,
          cogsCents: cogs,
          payrollCents: payroll,
          operatingExpensesCents: operatingExpenses,
          netResultCents: netResult,
          marginBps,
        },
        projected: {
          receivablesCents: (projectedReceivables._sum.outstandingCents ?? 0) + recurringProjectedIn,
          payablesCents: (projectedPayables._sum.outstandingCents ?? 0) + recurringProjectedOut,
          netCents:
            (projectedReceivables._sum.outstandingCents ?? 0) +
            recurringProjectedIn -
            (projectedPayables._sum.outstandingCents ?? 0) -
            recurringProjectedOut,
        },
        inventorySnapshot: latestSnapshot,
      };
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance dashboard error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/cash-flow", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = startOfDay(parseDate(req.query.start, new Date(Date.now() - 30 * DAY_MS)));
    const end = endOfDay(parseDate(req.query.end, new Date(Date.now() + 30 * DAY_MS)));

    const [realizedEntries, payables, receivables] = await Promise.all([
      prisma.financialEntry.findMany({
        where: {
          storeId,
          basis: "caixa",
          status: { in: ["approved", "reconciled"] },
          settlementDate: { gte: start, lte: end },
        },
        orderBy: { settlementDate: "asc" },
      }),
      prisma.accountsPayable.findMany({
        where: {
          storeId,
          status: { in: ["open", "partial", "overdue"] },
          dueDate: { gte: start, lte: end },
        },
      }),
      prisma.accountsReceivable.findMany({
        where: {
          storeId,
          status: { in: ["open", "partial", "overdue"] },
          dueDate: { not: null, gte: start, lte: end },
        },
      }),
    ]);

    const byDate = new Map<
      string,
      {
        date: string;
        realizedInCents: number;
        realizedOutCents: number;
        projectedInCents: number;
        projectedOutCents: number;
      }
    >();

    const ensureDate = (
      date: Date
    ): {
      date: string;
      realizedInCents: number;
      realizedOutCents: number;
      projectedInCents: number;
      projectedOutCents: number;
    } => {
      const key = date.toISOString().slice(0, 10);
      const existing = byDate.get(key);
      if (existing) return existing;
      const created = {
        date: key,
        realizedInCents: 0,
        realizedOutCents: 0,
        projectedInCents: 0,
        projectedOutCents: 0,
      };
      byDate.set(key, created);
      return created;
    };

    for (const entry of realizedEntries) {
      if (!entry.settlementDate) continue;
      const bucket = ensureDate(entry.settlementDate);
      if (entry.direction === "entrada") bucket.realizedInCents += entry.amountCents;
      else bucket.realizedOutCents += entry.amountCents;
    }

    for (const payable of payables) {
      const bucket = ensureDate(payable.dueDate);
      bucket.projectedOutCents += payable.outstandingCents;
    }

    for (const receivable of receivables) {
      if (!receivable.dueDate) continue;
      const bucket = ensureDate(receivable.dueDate);
      bucket.projectedInCents += receivable.outstandingCents;
    }

    const flow = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({
        ...day,
        realizedNetCents: day.realizedInCents - day.realizedOutCents,
        projectedNetCents: day.projectedInCents - day.projectedOutCents,
      }));

    res.status(200).json(flow);
  } catch (e) {
    console.error("Finance cash-flow error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/payables", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const status = req.query.status;
    const where =
      typeof status === "string" &&
      ["draft", "open", "partial", "paid", "canceled", "overdue"].includes(status)
        ? { storeId, status: status as AccountsPayableStatus }
        : { storeId };

    const items = await prisma.accountsPayable.findMany({
      where,
      include: {
        supplier: true,
        costCenter: true,
        process: true,
        settlements: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json(items);
  } catch (e) {
    console.error("Finance payables list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/payables", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      supplierId?: string | null;
      description?: string;
      amountCents?: number;
      dueDate?: string;
      competenceDate?: string;
      notes?: string;
      costCenterId?: string;
      processId?: string;
      status?: string;
    };

    const description = (body.description ?? "").trim();
    const amountCents = toCents(body.amountCents ?? 0);

    if (!description || amountCents <= 0 || !body.dueDate) {
      res.status(400).json({ error: "description, amountCents e dueDate são obrigatórios" });
      return;
    }

    const dueDate = parseDate(body.dueDate, new Date());
    const competenceDate = parseDate(body.competenceDate, dueDate);

    const result = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      const payable = await tx.accountsPayable.create({
        data: {
          storeId,
          supplierId: body.supplierId ?? null,
          description,
          amountCents,
          outstandingCents: amountCents,
          dueDate,
          competenceDate,
          status: "open",
          notes: body.notes ?? null,
          costCenterId: body.costCenterId ?? defaults.costCenterId,
          processId: body.processId ?? defaults.processId,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
          approvedAt: new Date(),
        },
      });

      await createFinancialEntry(tx, {
        storeId,
        origin: "payable",
        basis: "competencia",
        direction: "saida",
        amountCents,
        competenceDate,
        settlementDate: null,
        status: "approved",
        description: `Conta a pagar: ${description}`,
        costCenterId: payable.costCenterId,
        processId: payable.processId,
        supplierId: payable.supplierId,
        sourceRef: `payable:${payable.id}:competence`,
        createdByUserId: authReq.user.userId,
        approvedByUserId: authReq.user.userId,
        payableId: payable.id,
      });

      return payable;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error("Finance payable create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/payables/:id/settlements", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const payableId = req.params.id;
    const body = req.body as {
      accountId?: string;
      amountCents?: number;
      settledAt?: string;
    };

    const accountId = body.accountId;
    if (!accountId) {
      res.status(400).json({ error: "accountId é obrigatório" });
      return;
    }

    const amountCents = toCents(body.amountCents ?? 0);
    if (amountCents <= 0) {
      res.status(400).json({ error: "amountCents deve ser maior que zero" });
      return;
    }

    const settledAt = parseDate(body.settledAt, new Date());

    const result = await prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.findFirst({
        where: {
          id: payableId,
          storeId,
        },
      });

      if (!payable) throw new Error("Conta a pagar não encontrada");
      if (payable.outstandingCents <= 0) throw new Error("Conta a pagar já quitada");

      const settleAmount = Math.min(amountCents, payable.outstandingCents);

      const settlement = await tx.accountsPayableSettlement.create({
        data: {
          payableId,
          accountId,
          amountCents: settleAmount,
          settledAt,
          createdByUserId: authReq.user.userId,
        },
      });

      const entry = await createFinancialEntry(tx, {
        storeId,
        origin: "payable_settlement",
        basis: "caixa",
        direction: "saida",
        amountCents: settleAmount,
        competenceDate: payable.competenceDate,
        settlementDate: settledAt,
        status: "approved",
        description: `Baixa da conta a pagar ${payable.description}`,
        costCenterId: payable.costCenterId,
        processId: payable.processId,
        accountId,
        supplierId: payable.supplierId,
        sourceRef: `payable:${payable.id}:settlement:${settlement.id}`,
        createdByUserId: authReq.user.userId,
        approvedByUserId: authReq.user.userId,
        payableId: payable.id,
      });

      await tx.accountsPayableSettlement.update({
        where: { id: settlement.id },
        data: {
          financialEntryId: entry.entry.id,
        },
      });

      const outstandingCents = Math.max(0, payable.outstandingCents - settleAmount);
      const status = normalizePayableStatus(
        outstandingCents,
        payable.dueDate,
        payable.amountCents
      );

      const updated = await tx.accountsPayable.update({
        where: { id: payable.id },
        data: {
          outstandingCents,
          status,
          approvedByUserId: authReq.user.userId,
          approvedAt: payable.approvedAt ?? new Date(),
        },
      });

      return updated;
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance payable settlement error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/receivables", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const status = req.query.status;
    const where =
      typeof status === "string" &&
      ["draft", "open", "partial", "paid", "canceled", "overdue"].includes(status)
        ? { storeId, status: status as AccountsReceivableStatus }
        : { storeId };

    const items = await prisma.accountsReceivable.findMany({
      where,
      include: {
        customer: true,
        costCenter: true,
        process: true,
        settlements: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json(items);
  } catch (e) {
    console.error("Finance receivables list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/receivables", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      customerId?: string | null;
      description?: string;
      amountCents?: number;
      dueDate?: string | null;
      competenceDate?: string;
      notes?: string;
      costCenterId?: string;
      processId?: string;
    };

    const description = (body.description ?? "").trim();
    const amountCents = toCents(body.amountCents ?? 0);

    if (!description || amountCents <= 0) {
      res.status(400).json({ error: "description e amountCents são obrigatórios" });
      return;
    }

    const dueDate = body.dueDate ? parseDate(body.dueDate, new Date()) : null;
    const competenceDate = parseDate(body.competenceDate, new Date());

    const result = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      const receivable = await tx.accountsReceivable.create({
        data: {
          storeId,
          customerId: body.customerId ?? null,
          description,
          amountCents,
          outstandingCents: amountCents,
          dueDate,
          competenceDate,
          status: "open",
          notes: body.notes ?? null,
          costCenterId: body.costCenterId ?? defaults.costCenterId,
          processId: body.processId ?? defaults.processId,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
          approvedAt: new Date(),
        },
      });

      await createFinancialEntry(tx, {
        storeId,
        origin: "fiado_receivable",
        basis: "competencia",
        direction: "entrada",
        amountCents,
        competenceDate,
        settlementDate: null,
        status: "approved",
        description: `Conta a receber: ${description}`,
        costCenterId: receivable.costCenterId,
        processId: receivable.processId,
        customerId: receivable.customerId,
        sourceRef: `receivable:${receivable.id}:competence`,
        createdByUserId: authReq.user.userId,
        approvedByUserId: authReq.user.userId,
        receivableId: receivable.id,
      });

      if (receivable.customerId) {
        await tx.financialCustomer.update({
          where: { id: receivable.customerId },
          data: {
            fiadoBalanceCents: {
              increment: amountCents,
            },
          },
        });
      }

      return receivable;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error("Finance receivable create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/receivables/:id/settlements", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const receivableId = req.params.id;
    const body = req.body as {
      accountId?: string;
      amountCents?: number;
      settledAt?: string;
    };

    const accountId = body.accountId;
    if (!accountId) {
      res.status(400).json({ error: "accountId é obrigatório" });
      return;
    }

    const amountCents = toCents(body.amountCents ?? 0);
    if (amountCents <= 0) {
      res.status(400).json({ error: "amountCents deve ser maior que zero" });
      return;
    }

    const settledAt = parseDate(body.settledAt, new Date());

    const result = await prisma.$transaction(async (tx) => {
      const receivable = await tx.accountsReceivable.findFirst({
        where: {
          id: receivableId,
          storeId,
        },
      });

      if (!receivable) throw new Error("Conta a receber não encontrada");
      if (receivable.outstandingCents <= 0) throw new Error("Conta a receber já quitada");

      const settleAmount = Math.min(amountCents, receivable.outstandingCents);

      const settlement = await tx.accountsReceivableSettlement.create({
        data: {
          receivableId,
          accountId,
          amountCents: settleAmount,
          settledAt,
          createdByUserId: authReq.user.userId,
        },
      });

      const entry = await createFinancialEntry(tx, {
        storeId,
        origin: "receivable_settlement",
        basis: "caixa",
        direction: "entrada",
        amountCents: settleAmount,
        competenceDate: receivable.competenceDate,
        settlementDate: settledAt,
        status: "approved",
        description: `Baixa da conta a receber ${receivable.description}`,
        costCenterId: receivable.costCenterId,
        processId: receivable.processId,
        accountId,
        customerId: receivable.customerId,
        sourceRef: `receivable:${receivable.id}:settlement:${settlement.id}`,
        createdByUserId: authReq.user.userId,
        approvedByUserId: authReq.user.userId,
        receivableId: receivable.id,
      });

      await tx.accountsReceivableSettlement.update({
        where: { id: settlement.id },
        data: {
          financialEntryId: entry.entry.id,
        },
      });

      const outstandingCents = Math.max(0, receivable.outstandingCents - settleAmount);
      const status = normalizeReceivableStatus(
        outstandingCents,
        receivable.dueDate,
        receivable.amountCents
      );

      const updated = await tx.accountsReceivable.update({
        where: { id: receivable.id },
        data: {
          outstandingCents,
          status,
          approvedByUserId: authReq.user.userId,
          approvedAt: receivable.approvedAt ?? new Date(),
        },
      });

      if (receivable.customerId) {
        await tx.financialCustomer.update({
          where: { id: receivable.customerId },
          data: {
            fiadoBalanceCents: {
              decrement: settleAmount,
            },
          },
        });
      }

      return updated;
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance receivable settlement error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/customers", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const customers = await prisma.financialCustomer.findMany({
      where: { storeId },
      orderBy: [{ fiadoBalanceCents: "desc" }, { name: "asc" }],
      include: {
        receivables: {
          where: {
            status: { in: ["open", "partial", "overdue"] },
          },
          select: {
            id: true,
            outstandingCents: true,
            dueDate: true,
          },
        },
      },
    });

    res.status(200).json(customers);
  } catch (e) {
    console.error("Finance customers list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/customers", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      phone?: string;
      document?: string;
      notes?: string;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }

    const customer = await prisma.financialCustomer.create({
      data: {
        storeId,
        name,
        phone: (body.phone ?? "").trim() || null,
        document: normalizeCpfCnpj(body.document),
        notes: body.notes ?? null,
      },
    });

    res.status(201).json(customer);
  } catch (e) {
    console.error("Finance customer create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.patch("/customers/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      phone?: string | null;
      document?: string | null;
      notes?: string | null;
    };

    const customer = await prisma.financialCustomer.updateMany({
      where: {
        id: req.params.id,
        storeId,
      },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.document !== undefined ? { document: normalizeCpfCnpj(body.document) } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    res.status(200).json({ updated: customer.count > 0 });
  } catch (e) {
    console.error("Finance customer update error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/suppliers", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const suppliers = await prisma.financialSupplier.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
      include: {
        payables: {
          where: {
            status: { in: ["open", "partial", "overdue"] },
          },
          select: {
            id: true,
            outstandingCents: true,
            dueDate: true,
          },
        },
      },
    });

    res.status(200).json(suppliers);
  } catch (e) {
    console.error("Finance suppliers list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/suppliers", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      document?: string;
      notes?: string;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }

    const supplier = await prisma.financialSupplier.create({
      data: {
        storeId,
        name,
        document: normalizeCpfCnpj(body.document),
        notes: body.notes ?? null,
      },
    });

    res.status(201).json(supplier);
  } catch (e) {
    console.error("Finance supplier create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/employees", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const employees = await prisma.financialEmployee.findMany({
      where: { storeId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    res.status(200).json(employees);
  } catch (e) {
    console.error("Finance employees list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/employees", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      document?: string;
      baseSalaryCents?: number;
      active?: boolean;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }

    const employee = await prisma.financialEmployee.create({
      data: {
        storeId,
        name,
        document: normalizeCpfCnpj(body.document),
        baseSalaryCents: toCents(body.baseSalaryCents ?? 0),
        active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    res.status(201).json(employee);
  } catch (e) {
    console.error("Finance employee create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/payroll/import", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      period?: string;
      sourceName?: string;
      csv?: string;
      settlementDate?: string | null;
      accountId?: string | null;
    };

    const period = (body.period ?? "").trim();
    const sourceName = (body.sourceName ?? "manual_import").trim() || "manual_import";
    const csv = body.csv ?? "";

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      res.status(400).json({ error: "period deve estar no formato YYYY-MM" });
      return;
    }

    if (!csv.trim()) {
      res.status(400).json({ error: "csv é obrigatório" });
      return;
    }

    const rows = parseCsvRows(csv);
    if (rows.length === 0) {
      res.status(400).json({ error: "csv sem linhas válidas" });
      return;
    }

    const settlementDate = body.settlementDate ? parseDate(body.settlementDate, new Date()) : null;

    const result = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      const payrollImport = await tx.payrollImport.upsert({
        where: {
          storeId_period_sourceName: {
            storeId,
            period,
            sourceName,
          },
        },
        create: {
          storeId,
          period,
          sourceName,
          importedByUserId: authReq.user.userId,
          rawPayload: csv,
        },
        update: {
          rawPayload: csv,
          importedByUserId: authReq.user.userId,
        },
      });

      await tx.payrollEvent.deleteMany({
        where: { payrollImportId: payrollImport.id },
      });

      let createdEvents = 0;
      const aggregatedRows = new Map<
        string,
        {
          employeeName: string;
          employeeDoc: string | null;
          eventType: ReturnType<typeof parsePayrollEventType>;
          description: string;
          amountCents: number;
        }
      >();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 4) continue;

        const [employeeNameRaw, documentRaw, typeRaw, amountRaw, descriptionRaw] = row;
        const employeeName = employeeNameRaw.trim();
        if (!employeeName) continue;

        const eventType = parsePayrollEventType(typeRaw || "provento");
        const description = (descriptionRaw ?? "").trim() || `Evento de folha ${eventType}`;
        const amountCents = amountRaw.includes(",") || amountRaw.includes(".")
          ? parseCurrencyToCents(amountRaw)
          : toCents(Number(amountRaw));
        if (amountCents <= 0) continue;

        const employeeDoc = normalizeCpfCnpj(documentRaw);
        const employeeToken = (employeeDoc ?? employeeName.toLocaleLowerCase()).trim();
        const aggregationKey = `${employeeToken}|${eventType}|${description.toLocaleLowerCase()}`;
        const existing = aggregatedRows.get(aggregationKey);
        if (existing) {
          existing.amountCents += amountCents;
        } else {
          aggregatedRows.set(aggregationKey, {
            employeeName,
            employeeDoc,
            eventType,
            description,
            amountCents,
          });
        }
      }

      let sourceSequence = 0;
      for (const row of aggregatedRows.values()) {
        const { employeeName, employeeDoc, eventType, description, amountCents } = row;

        let employee = null as { id: string; name: string } | null;
        if (employeeDoc) {
          employee = await tx.financialEmployee.findFirst({
            where: { storeId, document: employeeDoc },
            select: { id: true, name: true },
          });
        }

        if (!employee) {
          employee = await tx.financialEmployee.findFirst({
            where: { storeId, name: employeeName },
            select: { id: true, name: true },
          });
        }

        if (!employee) {
          employee = await tx.financialEmployee.create({
            data: {
              storeId,
              name: employeeName,
              document: employeeDoc,
              active: true,
              baseSalaryCents: 0,
            },
            select: { id: true, name: true },
          });
        }

        const competenceDate = new Date(`${period}-01T00:00:00.000Z`);

        await tx.payrollEvent.create({
          data: {
            storeId,
            payrollImportId: payrollImport.id,
            employeeId: employee.id,
            period,
            type: eventType,
            description,
            amountCents,
            competenceDate,
            settlementDate,
          },
        });

        const sourceBase = `payroll:${payrollImport.id}:${employee.id}:${eventType}:${sourceSequence}`;

        await createFinancialEntry(tx, {
          storeId,
          origin: "payroll",
          basis: "competencia",
          direction: "saida",
          amountCents,
          competenceDate,
          settlementDate: null,
          status: "approved",
          description: `Folha ${period} - ${employee.name} (${eventType})`,
          costCenterId: defaults.costCenterId,
          processId: defaults.processId,
          employeeId: employee.id,
          sourceRef: `${sourceBase}:competence`,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
        });

        if (settlementDate && body.accountId) {
          await createFinancialEntry(tx, {
            storeId,
            origin: "payroll",
            basis: "caixa",
            direction: "saida",
            amountCents,
            competenceDate,
            settlementDate,
            status: "approved",
            description: `Pagamento folha ${period} - ${employee.name}`,
            costCenterId: defaults.costCenterId,
            processId: defaults.processId,
            accountId: body.accountId,
            employeeId: employee.id,
            sourceRef: `${sourceBase}:settlement`,
            createdByUserId: authReq.user.userId,
            approvedByUserId: authReq.user.userId,
          });
        }

        createdEvents += 1;
        sourceSequence += 1;
      }

      return {
        payrollImportId: payrollImport.id,
        createdEvents,
      };
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance payroll import error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/payroll/events", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const period = typeof req.query.period === "string" ? req.query.period : undefined;

    const events = await prisma.payrollEvent.findMany({
      where: {
        storeId,
        ...(period ? { period } : {}),
      },
      include: {
        employee: true,
        payrollImport: true,
      },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    res.status(200).json(events);
  } catch (e) {
    console.error("Finance payroll events list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/fiscal/rules", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const rules = await prisma.fiscalTaxRule.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(rules);
  } catch (e) {
    console.error("Finance fiscal rules list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/fiscal/rules", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      type?: string;
      appliesTo?: string;
      productCategory?: string | null;
      paymentMethod?: string | null;
      rateBps?: number;
      active?: boolean;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "name é obrigatório" });
      return;
    }

    const appliesTo = (body.appliesTo ?? "sale").trim().toLowerCase();
    if (!["sale", "payment"].includes(appliesTo)) {
      res.status(400).json({ error: "appliesTo deve ser sale ou payment" });
      return;
    }

    const rule = await prisma.fiscalTaxRule.create({
      data: {
        storeId,
        name,
        type: parseFiscalRuleType(body.type ?? "imposto"),
        appliesTo,
        productCategory: parseProductCategory(body.productCategory),
        paymentMethod: body.paymentMethod ? parsePaymentMethod(body.paymentMethod) : null,
        rateBps: Math.max(0, toInt(body.rateBps, 0)),
        active: typeof body.active === "boolean" ? body.active : true,
      },
    });

    res.status(201).json(rule);
  } catch (e) {
    console.error("Finance fiscal rule create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.patch("/fiscal/rules/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      type?: string;
      appliesTo?: string;
      productCategory?: string | null;
      paymentMethod?: string | null;
      rateBps?: number;
      active?: boolean;
    };

    const updated = await prisma.fiscalTaxRule.updateMany({
      where: {
        id: req.params.id,
        storeId,
      },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.type !== undefined ? { type: parseFiscalRuleType(body.type) } : {}),
        ...(body.appliesTo !== undefined ? { appliesTo: body.appliesTo.trim().toLowerCase() } : {}),
        ...(body.productCategory !== undefined
          ? { productCategory: parseProductCategory(body.productCategory) }
          : {}),
        ...(body.paymentMethod !== undefined
          ? { paymentMethod: body.paymentMethod ? parsePaymentMethod(body.paymentMethod) : null }
          : {}),
        ...(body.rateBps !== undefined ? { rateBps: Math.max(0, toInt(body.rateBps, 0)) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      },
    });

    res.status(200).json({ updated: updated.count > 0 });
  } catch (e) {
    console.error("Finance fiscal rule update error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/fiscal/import-xml", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      xml?: string;
      direction?: string;
    };

    const xml = body.xml ?? "";
    if (!xml.trim()) {
      res.status(400).json({ error: "xml é obrigatório" });
      return;
    }

    const keyFromTag = parseXmlTag(xml, "chNFe");
    const keyFromAttr = xml.match(/Id="NFe(\d{44})"/i)?.[1] ?? null;
    const key = keyFromTag || keyFromAttr;

    if (!key) {
      res.status(400).json({ error: "Não foi possível identificar a chave da NF-e" });
      return;
    }

    const issueDateRaw = parseXmlTag(xml, "dhEmi") ?? parseXmlTag(xml, "dEmi");
    const issueDate = issueDateRaw ? parseDate(issueDateRaw, new Date()) : new Date();

    const totalRaw = parseXmlTag(xml, "vNF") ?? "0";
    const totalCents = parseCurrencyToCents(totalRaw);

    const number = parseXmlTag(xml, "nNF");
    const series = parseXmlTag(xml, "serie");
    const issuerName = parseXmlTag(xml, "xNome");
    const issuerDocument = normalizeCpfCnpj(parseXmlTag(xml, "CNPJ") ?? parseXmlTag(xml, "CPF"));

    const direction = body.direction === "entrada" ? "entrada" : "saida";

    const taxTags = ["vICMS", "vPIS", "vCOFINS", "vIPI", "vISS"] as const;

    const result = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      const fiscalDocument = await tx.fiscalDocument.upsert({
        where: {
          storeId_key: {
            storeId,
            key,
          },
        },
        create: {
          storeId,
          key,
          number,
          series,
          issuerDocument,
          issuerName,
          direction,
          issueDate,
          totalCents,
          xmlContent: xml,
          importedByUserId: authReq.user.userId,
        },
        update: {
          number,
          series,
          issuerDocument,
          issuerName,
          direction,
          issueDate,
          totalCents,
          xmlContent: xml,
          importedByUserId: authReq.user.userId,
        },
      });

      await tx.fiscalDocumentTax.deleteMany({ where: { fiscalDocumentId: fiscalDocument.id } });

      for (const tag of taxTags) {
        const valueRaw = parseXmlTag(xml, tag);
        if (!valueRaw) continue;
        const amountCents = parseCurrencyToCents(valueRaw);
        if (amountCents <= 0) continue;

        await tx.fiscalDocumentTax.create({
          data: {
            fiscalDocumentId: fiscalDocument.id,
            name: tag,
            amountCents,
          },
        });

        await createFinancialEntry(tx, {
          storeId,
          origin: "tax",
          basis: "competencia",
          direction: "saida",
          amountCents,
          competenceDate: issueDate,
          settlementDate: null,
          status: "approved",
          description: `Imposto ${tag} da NF ${number ?? fiscalDocument.key}`,
          costCenterId: defaults.costCenterId,
          processId: defaults.processId,
          fiscalDocumentId: fiscalDocument.id,
          sourceRef: `fiscal:${fiscalDocument.id}:tax:${tag}`,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
        });
      }

      if (totalCents > 0) {
        await createFinancialEntry(tx, {
          storeId,
          origin: "fiscal_import",
          basis: "competencia",
          direction: direction === "entrada" ? "saida" : "entrada",
          amountCents: totalCents,
          competenceDate: issueDate,
          settlementDate: null,
          status: "approved",
          description: `Documento fiscal ${direction} ${number ?? fiscalDocument.key}`,
          costCenterId: defaults.costCenterId,
          processId: defaults.processId,
          fiscalDocumentId: fiscalDocument.id,
          sourceRef: `fiscal:${fiscalDocument.id}:total`,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
        });
      }

      return fiscalDocument;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error("Finance fiscal xml import error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/fiscal/documents", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = parseDate(req.query.start, new Date(Date.now() - 60 * DAY_MS));
    const end = parseDate(req.query.end, new Date());

    const docs = await prisma.fiscalDocument.findMany({
      where: {
        storeId,
        issueDate: {
          gte: startOfDay(start),
          lte: endOfDay(end),
        },
      },
      include: {
        taxes: true,
      },
      orderBy: { issueDate: "desc" },
      take: 500,
    });

    res.status(200).json(docs);
  } catch (e) {
    console.error("Finance fiscal docs list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/reconciliation/import", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      accountId?: string;
      format?: string;
      fileName?: string;
      content?: string;
    };

    const accountId = body.accountId ?? "";
    const format = (body.format ?? "csv") as ReconciliationImportFormat;
    const content = body.content ?? "";

    if (!accountId || !content.trim()) {
      res.status(400).json({ error: "accountId e content são obrigatórios" });
      return;
    }

    if (format !== "csv" && format !== "ofx") {
      res.status(400).json({ error: "format deve ser csv ou ofx" });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const importRecord = await tx.reconciliationImport.create({
        data: {
          storeId,
          accountId,
          format,
          fileName: body.fileName ?? null,
          importedByUserId: authReq.user.userId,
        },
      });

      const parsedRows: Array<{
        externalId: string | null;
        occurredAt: Date;
        description: string;
        amountCents: number;
        direction: FinancialDirection;
      }> = [];

      if (format === "csv") {
        for (const row of parseCsvRows(content)) {
          if (row.length < 3) continue;
          const [dateRaw, descriptionRaw, amountRaw] = row;
          const occurredAt = parseDateFromString(dateRaw) ?? new Date();
          const amountParsed = parseCurrencyToCents(amountRaw);
          const direction: FinancialDirection = amountParsed >= 0 ? "entrada" : "saida";
          const amountCents = Math.abs(amountParsed);
          if (amountCents <= 0) continue;

          parsedRows.push({
            externalId: null,
            occurredAt,
            description: descriptionRaw || "Movimento importado",
            amountCents,
            direction,
          });
        }
      } else {
        const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
        for (const block of blocks) {
          const dateRaw = (block.match(/<DTPOSTED>([^<\r\n]+)/i)?.[1] ?? "").trim();
          const amountRaw = (block.match(/<TRNAMT>([^<\r\n]+)/i)?.[1] ?? "").trim();
          const memo =
            (block.match(/<MEMO>([^<\r\n]+)/i)?.[1] ?? block.match(/<NAME>([^<\r\n]+)/i)?.[1] ?? "")
              .trim();
          const externalId = (block.match(/<FITID>([^<\r\n]+)/i)?.[1] ?? "").trim() || null;

          const occurredAt = parseOfxDate(dateRaw) ?? new Date();
          const amountParsed = parseCurrencyToCents(amountRaw);
          const direction: FinancialDirection = amountParsed >= 0 ? "entrada" : "saida";
          const amountCents = Math.abs(amountParsed);
          if (amountCents <= 0) continue;

          parsedRows.push({
            externalId,
            occurredAt,
            description: memo || "Movimento OFX",
            amountCents,
            direction,
          });
        }
      }

      let matchedCount = 0;
      for (const row of parsedRows) {
        const candidate = await tx.financialEntry.findFirst({
          where: {
            storeId,
            accountId,
            status: { in: ["approved", "reconciled"] },
            direction: row.direction,
            amountCents: row.amountCents,
            settlementDate: {
              gte: new Date(row.occurredAt.getTime() - 2 * DAY_MS),
              lte: new Date(row.occurredAt.getTime() + 2 * DAY_MS),
            },
          },
          orderBy: { settlementDate: "asc" },
        });

        const createdRow = await tx.reconciliationRow.create({
          data: {
            reconciliationImportId: importRecord.id,
            storeId,
            accountId,
            externalId: row.externalId,
            occurredAt: row.occurredAt,
            description: row.description,
            amountCents: row.amountCents,
            direction: row.direction,
            matchedEntryId: candidate?.id ?? null,
            matchStatus: candidate ? "matched" : "suggested",
          },
        });

        if (candidate && candidate.status !== "reconciled") {
          await transitionFinancialEntryStatus(tx, {
            storeId,
            entryId: candidate.id,
            nextStatus: "reconciled",
            performedByUserId: authReq.user.userId,
            notes: `Conciliado automaticamente (import ${importRecord.id})`,
          });
          matchedCount += 1;
        }

        if (candidate && candidate.status === "reconciled") {
          matchedCount += 1;
        }

        if (!candidate) {
          void createdRow;
        }
      }

      return {
        importId: importRecord.id,
        importedRows: parsedRows.length,
        matchedRows: matchedCount,
      };
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance reconciliation import error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/reconciliation/rows", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const rows = await prisma.reconciliationRow.findMany({
      where: {
        storeId,
        ...(status && ["suggested", "matched", "ignored"].includes(status)
          ? { matchStatus: status as ReconciliationMatchStatus }
          : {}),
      },
      include: {
        matchedEntry: true,
        account: true,
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    res.status(200).json(rows);
  } catch (e) {
    console.error("Finance reconciliation rows list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/reconciliation/match", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      rowId?: string;
      entryId?: string | null;
    };

    if (!body.rowId) {
      res.status(400).json({ error: "rowId é obrigatório" });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.reconciliationRow.findFirst({
        where: {
          id: body.rowId,
          storeId,
        },
      });

      if (!row) throw new Error("Linha de conciliação não encontrada");

      if (!body.entryId) {
        const updated = await tx.reconciliationRow.update({
          where: { id: row.id },
          data: {
            matchedEntryId: null,
            matchStatus: "ignored",
          },
        });
        return updated;
      }

      const entry = await tx.financialEntry.findFirst({
        where: {
          id: body.entryId,
          storeId,
        },
      });

      if (!entry) throw new Error("Lançamento financeiro não encontrado");

      const updated = await tx.reconciliationRow.update({
        where: { id: row.id },
        data: {
          matchedEntryId: entry.id,
          matchStatus: "matched",
        },
      });

      if (entry.status !== "reconciled") {
        await transitionFinancialEntryStatus(tx, {
          storeId,
          entryId: entry.id,
          nextStatus: "reconciled",
          performedByUserId: authReq.user.userId,
          notes: `Conciliação manual via row ${row.id}`,
        });
      }

      return updated;
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance reconciliation match error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/cash-sessions", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const sessions = await prisma.cashSession.findMany({
      where: {
        storeId,
        ...(status && ["open", "closed", "canceled"].includes(status)
          ? { status: status as CashSessionStatus }
          : {}),
      },
      include: {
        account: true,
        movements: {
          include: {
            financialEntry: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
      take: 100,
    });

    res.status(200).json(sessions);
  } catch (e) {
    console.error("Finance cash sessions list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/cash-sessions/open", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      accountId?: string;
      openingAmountCents?: number;
      notes?: string;
    };

    const openingAmountCents = toCents(body.openingAmountCents ?? 0);

    const session = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);
      const accountId = body.accountId ?? defaults.accountId;

      const alreadyOpen = await tx.cashSession.findFirst({
        where: {
          storeId,
          accountId,
          status: "open",
        },
        select: { id: true },
      });

      if (alreadyOpen) {
        throw new Error("Já existe sessão de caixa aberta para esta conta");
      }

      const created = await tx.cashSession.create({
        data: {
          storeId,
          accountId,
          openedByUserId: authReq.user.userId,
          status: "open",
          openingAmountCents,
          notes: body.notes ?? null,
        },
      });

      if (openingAmountCents > 0) {
        const openingEntry = await createFinancialEntry(tx, {
          storeId,
          origin: "cash_movement",
          basis: "caixa",
          direction: "entrada",
          amountCents: openingAmountCents,
          competenceDate: created.openedAt,
          settlementDate: created.openedAt,
          status: "approved",
          description: `Abertura de caixa ${created.id}`,
          costCenterId: defaults.costCenterId,
          processId: defaults.processId,
          accountId,
          sourceRef: `cash-session:${created.id}:opening`,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
        });

        await tx.cashMovement.create({
          data: {
            storeId,
            cashSessionId: created.id,
            type: "opening",
            amountCents: openingAmountCents,
            description: "Abertura de caixa",
            createdByUserId: authReq.user.userId,
            financialEntryId: openingEntry.entry.id,
          },
        });
      }

      return tx.cashSession.findUnique({
        where: { id: created.id },
        include: {
          account: true,
          movements: {
            include: { financialEntry: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });

    res.status(201).json(session);
  } catch (e) {
    console.error("Finance cash session open error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/cash-sessions/:id/movements", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const sessionId = req.params.id;
    const body = req.body as {
      type?: string;
      amountCents?: number;
      description?: string;
      direction?: string;
    };

    const type = (body.type ?? "adjustment").trim().toLowerCase();
    const amountCents = toCents(body.amountCents ?? 0);

    if (!["suprimento", "sangria", "adjustment", "sale_collection", "expense_payment"].includes(type)) {
      res.status(400).json({ error: "type inválido" });
      return;
    }

    if (amountCents <= 0) {
      res.status(400).json({ error: "amountCents deve ser maior que zero" });
      return;
    }

    const movement = await prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: {
          id: sessionId,
          storeId,
          status: "open",
        },
      });

      if (!session) throw new Error("Sessão de caixa aberta não encontrada");

      const defaults = await ensureDefaultFinanceContext(tx, storeId);

      let direction: FinancialDirection;
      if (type === "suprimento" || type === "sale_collection") direction = "entrada";
      else if (type === "sangria" || type === "expense_payment") direction = "saida";
      else direction = body.direction === "entrada" ? "entrada" : "saida";

      const entry = await createFinancialEntry(tx, {
        storeId,
        origin: "cash_movement",
        basis: "caixa",
        direction,
        amountCents,
        competenceDate: new Date(),
        settlementDate: new Date(),
        status: "approved",
        description: body.description?.trim() || `Movimento de caixa ${type}`,
        costCenterId: defaults.costCenterId,
        processId: defaults.processId,
        accountId: session.accountId,
        sourceRef: `cash-session:${session.id}:movement:${type}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        createdByUserId: authReq.user.userId,
        approvedByUserId: authReq.user.userId,
      });

      return tx.cashMovement.create({
        data: {
          storeId,
          cashSessionId: session.id,
          type: type as never,
          amountCents: direction === "entrada" ? amountCents : -amountCents,
          description: body.description?.trim() || null,
          createdByUserId: authReq.user.userId,
          financialEntryId: entry.entry.id,
        },
        include: {
          financialEntry: true,
        },
      });
    });

    res.status(201).json(movement);
  } catch (e) {
    console.error("Finance cash movement create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/cash-sessions/:id/close", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      countedAmountCents?: number;
      notes?: string;
    };

    const countedAmountCents = toCents(body.countedAmountCents ?? 0);

    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({
        where: {
          id: req.params.id,
          storeId,
          status: "open",
        },
        include: {
          movements: {
            include: { financialEntry: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!existing) throw new Error("Sessão aberta não encontrada");

      let expected = 0;
      for (const movement of existing.movements) {
        if (!movement.financialEntry) continue;
        expected += signedAmount(movement.financialEntry.direction, movement.financialEntry.amountCents);
      }

      const differenceCents = countedAmountCents - expected;

      if (differenceCents !== 0) {
        const defaults = await ensureDefaultFinanceContext(tx, storeId);
        const direction: FinancialDirection = differenceCents > 0 ? "entrada" : "saida";

        const diffEntry = await createFinancialEntry(tx, {
          storeId,
          origin: "cash_movement",
          basis: "caixa",
          direction,
          amountCents: Math.abs(differenceCents),
          competenceDate: new Date(),
          settlementDate: new Date(),
          status: "approved",
          description: `Diferença de fechamento de caixa ${existing.id}`,
          costCenterId: defaults.costCenterId,
          processId: defaults.processId,
          accountId: existing.accountId,
          sourceRef: `cash-session:${existing.id}:closing-difference`,
          createdByUserId: authReq.user.userId,
          approvedByUserId: authReq.user.userId,
        });

        await tx.cashMovement.create({
          data: {
            storeId,
            cashSessionId: existing.id,
            type: "closing_difference",
            amountCents: differenceCents,
            description: "Diferença de fechamento",
            createdByUserId: authReq.user.userId,
            financialEntryId: diffEntry.entry.id,
          },
        });
      }

      await tx.cashSession.update({
        where: { id: existing.id },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedByUserId: authReq.user.userId,
          closingAmountExpectedCents: expected,
          closingAmountCountedCents: countedAmountCents,
          differenceCents,
          notes: body.notes ?? existing.notes,
        },
      });

      return tx.cashSession.findUnique({
        where: { id: existing.id },
        include: {
          account: true,
          movements: {
            include: { financialEntry: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });

    res.status(200).json(session);
  } catch (e) {
    console.error("Finance cash session close error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/recurring", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const items = await prisma.recurringTemplate.findMany({
      where: { storeId },
      include: {
        costCenter: true,
        process: true,
      },
      orderBy: [{ active: "desc" }, { nextRunDate: "asc" }],
    });

    res.status(200).json(items);
  } catch (e) {
    console.error("Finance recurring list error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/recurring", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      direction?: string;
      amountCents?: number;
      startDate?: string;
      endDate?: string | null;
      interval?: string;
      costCenterId?: string;
      processId?: string;
      counterpartyType?: string;
      counterpartyLabel?: string;
      active?: boolean;
    };

    const name = (body.name ?? "").trim();
    const direction = parseFinancialDirection(body.direction ?? "saida");
    const interval =
      body.interval === "weekly" || body.interval === "yearly" || body.interval === "monthly"
        ? (body.interval as RecurringInterval)
        : null;

    if (!name || !direction || !interval) {
      res.status(400).json({ error: "name, direction e interval são obrigatórios" });
      return;
    }

    const amountCents = toCents(body.amountCents ?? 0);
    if (amountCents <= 0) {
      res.status(400).json({ error: "amountCents deve ser maior que zero" });
      return;
    }

    const startDate = parseDate(body.startDate, new Date());
    const endDate = body.endDate ? parseDate(body.endDate, startDate) : null;

    const item = await prisma.$transaction(async (tx) => {
      const defaults = await ensureDefaultFinanceContext(tx, storeId);
      return tx.recurringTemplate.create({
        data: {
          storeId,
          name,
          direction,
          amountCents,
          startDate,
          endDate,
          interval,
          nextRunDate: startDate,
          active: typeof body.active === "boolean" ? body.active : true,
          costCenterId: body.costCenterId ?? defaults.costCenterId,
          processId: body.processId ?? defaults.processId,
          counterpartyType: parseCounterpartyType(body.counterpartyType),
          counterpartyLabel: body.counterpartyLabel ?? null,
          createdByUserId: authReq.user.userId,
        },
      });
    });

    res.status(201).json(item);
  } catch (e) {
    console.error("Finance recurring create error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.patch("/recurring/:id", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const body = req.body as {
      name?: string;
      amountCents?: number;
      active?: boolean;
      endDate?: string | null;
      nextRunDate?: string;
    };

    const updated = await prisma.recurringTemplate.updateMany({
      where: {
        id: req.params.id,
        storeId,
      },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.amountCents !== undefined ? { amountCents: toCents(body.amountCents) } : {}),
        ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? parseDate(body.endDate, new Date()) : null } : {}),
        ...(body.nextRunDate !== undefined ? { nextRunDate: parseDate(body.nextRunDate, new Date()) } : {}),
      },
    });

    res.status(200).json({ updated: updated.count > 0 });
  } catch (e) {
    console.error("Finance recurring update error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/recurring/run", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const runUntil = parseDate(req.body?.runUntil, new Date());

    const result = await prisma.$transaction(async (tx) => {
      const templates = await tx.recurringTemplate.findMany({
        where: {
          storeId,
          active: true,
          nextRunDate: { lte: runUntil },
        },
        orderBy: { nextRunDate: "asc" },
      });

      let generatedPayables = 0;
      let generatedReceivables = 0;

      for (const template of templates) {
        let cursor = new Date(template.nextRunDate);
        let guard = 0;

        while (cursor <= runUntil && guard < 300) {
          if (template.endDate && cursor > template.endDate) break;

          if (template.direction === "saida") {
            const payable = await tx.accountsPayable.create({
              data: {
                storeId,
                supplierId: null,
                description: `Recorrência: ${template.name}`,
                amountCents: template.amountCents,
                outstandingCents: template.amountCents,
                dueDate: cursor,
                competenceDate: cursor,
                status: "open",
                notes: `Gerado por recorrência ${template.id}`,
                costCenterId: template.costCenterId,
                processId: template.processId,
                createdByUserId: authReq.user.userId,
                approvedByUserId: authReq.user.userId,
                approvedAt: new Date(),
                recurringTemplateId: template.id,
              },
            });

            await createFinancialEntry(tx, {
              storeId,
              origin: "recurring",
              basis: "competencia",
              direction: "saida",
              amountCents: template.amountCents,
              competenceDate: cursor,
              settlementDate: null,
              status: "approved",
              description: `Recorrência (pagar): ${template.name}`,
              costCenterId: template.costCenterId,
              processId: template.processId,
              sourceRef: `recurring:${template.id}:payable:${cursor.toISOString().slice(0, 10)}`,
              createdByUserId: authReq.user.userId,
              approvedByUserId: authReq.user.userId,
              payableId: payable.id,
            });

            generatedPayables += 1;
          } else {
            const receivable = await tx.accountsReceivable.create({
              data: {
                storeId,
                customerId: null,
                description: `Recorrência: ${template.name}`,
                amountCents: template.amountCents,
                outstandingCents: template.amountCents,
                dueDate: cursor,
                competenceDate: cursor,
                status: "open",
                notes: `Gerado por recorrência ${template.id}`,
                costCenterId: template.costCenterId,
                processId: template.processId,
                createdByUserId: authReq.user.userId,
                approvedByUserId: authReq.user.userId,
                approvedAt: new Date(),
                recurringTemplateId: template.id,
              },
            });

            await createFinancialEntry(tx, {
              storeId,
              origin: "recurring",
              basis: "competencia",
              direction: "entrada",
              amountCents: template.amountCents,
              competenceDate: cursor,
              settlementDate: null,
              status: "approved",
              description: `Recorrência (receber): ${template.name}`,
              costCenterId: template.costCenterId,
              processId: template.processId,
              sourceRef: `recurring:${template.id}:receivable:${cursor.toISOString().slice(0, 10)}`,
              createdByUserId: authReq.user.userId,
              approvedByUserId: authReq.user.userId,
              receivableId: receivable.id,
            });

            generatedReceivables += 1;
          }

          cursor = addByInterval(cursor, template.interval);
          guard += 1;
        }

        await tx.recurringTemplate.update({
          where: { id: template.id },
          data: {
            nextRunDate: cursor,
            lastRunDate: new Date(),
          },
        });
      }

      return {
        templatesProcessed: templates.length,
        generatedPayables,
        generatedReceivables,
      };
    });

    res.status(200).json(result);
  } catch (e) {
    console.error("Finance recurring run error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/alerts", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const alerts = await prisma.$transaction(async (tx) => {
      await refreshFinancialAlerts(tx, storeId);
      return tx.financialAlert.findMany({
        where: {
          storeId,
          status: "open",
        },
        orderBy: [{ type: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      });
    });

    res.status(200).json(alerts);
  } catch (e) {
    console.error("Finance alerts error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.post("/backfill", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const result = await runSalesBackfill(storeId, authReq.user.userId);
    res.status(200).json(result);
  } catch (e) {
    console.error("Finance backfill error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/export/entries.csv", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = parseDate(req.query.start, new Date(Date.now() - 30 * DAY_MS));
    const end = parseDate(req.query.end, new Date());

    const entries = await prisma.financialEntry.findMany({
      where: {
        storeId,
        OR: [
          { competenceDate: { gte: startOfDay(start), lte: endOfDay(end) } },
          { settlementDate: { gte: startOfDay(start), lte: endOfDay(end) } },
        ],
      },
      include: {
        costCenter: true,
        process: true,
        account: true,
      },
      orderBy: [{ competenceDate: "asc" }, { createdAt: "asc" }],
    });

    const rows: string[][] = [
      [
        "id",
        "origin",
        "basis",
        "direction",
        "status",
        "amount_cents",
        "competence_date",
        "settlement_date",
        "cost_center",
        "process",
        "account",
        "description",
        "source_ref",
      ],
    ];

    for (const entry of entries) {
      rows.push([
        entry.id,
        entry.origin,
        entry.basis,
        entry.direction,
        entry.status,
        String(entry.amountCents),
        entry.competenceDate.toISOString(),
        entry.settlementDate?.toISOString() ?? "",
        entry.costCenter.name,
        entry.process.name,
        entry.account?.name ?? "",
        entry.description ?? "",
        entry.sourceRef,
      ]);
    }

    const csv = buildCsv(rows);

    res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", "attachment; filename=finance_entries.csv")
      .send(csv);
  } catch (e) {
    console.error("Finance export entries csv error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/export/dre.csv", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = startOfDay(parseDate(req.query.start, new Date(Date.now() - 30 * DAY_MS)));
    const end = endOfDay(parseDate(req.query.end, new Date()));

    const entries = await prisma.financialEntry.findMany({
      where: {
        storeId,
        status: { in: ["approved", "reconciled"] },
        competenceDate: { gte: start, lte: end },
      },
    });

    let receitaBruta = 0;
    let impostos = 0;
    let taxas = 0;
    let cmv = 0;
    let folha = 0;
    let despesas = 0;

    for (const entry of entries) {
      if (entry.origin === "sale" && entry.direction === "entrada") receitaBruta += entry.amountCents;
      if (entry.origin === "tax") impostos += entry.amountCents;
      if (entry.origin === "sale_payment" && entry.direction === "saida") taxas += entry.amountCents;
      if (entry.origin === "sale" && entry.direction === "saida") cmv += entry.amountCents;
      if (entry.origin === "payroll") folha += entry.amountCents;
      if (entry.direction === "saida" && !["sale", "tax", "payroll"].includes(entry.origin)) {
        despesas += entry.amountCents;
      }
    }

    const resultado = receitaBruta - impostos - taxas - cmv - folha - despesas;

    const csv = buildCsv([
      ["conta", "valor_cents"],
      ["receita_bruta", String(receitaBruta)],
      ["impostos", String(impostos)],
      ["taxas", String(taxas)],
      ["cmv", String(cmv)],
      ["folha", String(folha)],
      ["despesas_operacionais", String(despesas)],
      ["resultado_liquido", String(resultado)],
    ]);

    res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", "attachment; filename=finance_dre.csv")
      .send(csv);
  } catch (e) {
    console.error("Finance export dre csv error:", e);
    res.status(500).json({ error: String(e) });
  }
});

financeRouter.get("/export/accounting-layout.csv", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const storeId = getStoreId(authReq, res);
    if (!storeId) return;

    const start = parseDate(req.query.start, new Date(Date.now() - 30 * DAY_MS));
    const end = parseDate(req.query.end, new Date());

    const entries = await prisma.financialEntry.findMany({
      where: {
        storeId,
        status: { in: ["approved", "reconciled"] },
        OR: [
          { competenceDate: { gte: startOfDay(start), lte: endOfDay(end) } },
          { settlementDate: { gte: startOfDay(start), lte: endOfDay(end) } },
        ],
      },
      include: {
        costCenter: true,
        process: true,
      },
      orderBy: [{ competenceDate: "asc" }, { createdAt: "asc" }],
    });

    const rows: string[][] = [[
      "data",
      "historico",
      "conta_referencia",
      "centro_custo",
      "processo",
      "debito_cents",
      "credito_cents",
      "origem",
      "source_ref",
    ]];

    for (const entry of entries) {
      const date = (entry.settlementDate ?? entry.competenceDate).toISOString().slice(0, 10);
      const debit = entry.direction === "saida" ? String(entry.amountCents) : "0";
      const credit = entry.direction === "entrada" ? String(entry.amountCents) : "0";

      rows.push([
        date,
        entry.description ?? entry.origin,
        entry.accountId ?? "N/A",
        entry.costCenter.code,
        entry.process.code,
        debit,
        credit,
        entry.origin,
        entry.sourceRef,
      ]);
    }

    const csv = buildCsv(rows);

    res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", "attachment; filename=finance_accounting_layout.csv")
      .send(csv);
  } catch (e) {
    console.error("Finance export accounting layout csv error:", e);
    res.status(500).json({ error: String(e) });
  }
});
