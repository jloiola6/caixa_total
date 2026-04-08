import { getApiUrl, getAuthHeaders } from "@/lib/api"

export type FinanceBootstrap = {
  defaults: {
    costCenterId: string
    processId: string
    accountId: string
  }
  costCenters: Array<{ id: string; code: string; name: string; active: boolean }>
  processes: Array<{ id: string; code: string; name: string; active: boolean }>
  accounts: Array<{
    id: string
    name: string
    type: string
    openingBalanceCents: number
    currentBalanceCents: number
    active: boolean
  }>
  taxRules: Array<{
    id: string
    name: string
    type: "imposto" | "taxa"
    appliesTo: string
    rateBps: number
    active: boolean
    productCategory: string | null
    paymentMethod: string | null
  }>
}

export type FinanceCostCenter = {
  id: string
  code: string
  name: string
  active: boolean
}

export type FinanceProcess = {
  id: string
  code: string
  name: string
  active: boolean
}

export type FinanceAccount = {
  id: string
  name: string
  type: string
  openingBalanceCents: number
  currentBalanceCents: number
  active: boolean
}

export type FinanceDashboard = {
  period: { start: string; end: string }
  cash: { inCents: number; outCents: number; netCents: number }
  competence: { inCents: number; outCents: number; netCents: number }
  dre: {
    grossRevenueCents: number
    taxesCents: number
    feesCents: number
    cogsCents: number
    payrollCents: number
    operatingExpensesCents: number
    netResultCents: number
    marginBps: number
  }
  projected: {
    receivablesCents: number
    payablesCents: number
    netCents: number
  }
  inventorySnapshot: {
    id: string
    capturedAt: string
    totalCostCents: number
    totalRetailCents: number
    totalMarginCents: number
    itemsCount: number
  } | null
}

export type FinanceEntry = {
  id: string
  origin: string
  basis: "caixa" | "competencia"
  direction: "entrada" | "saida"
  amountCents: number
  competenceDate: string
  settlementDate: string | null
  status: "draft" | "approved" | "reconciled" | "canceled"
  description: string | null
  sourceRef: string
  costCenter: { id: string; code: string; name: string }
  process: { id: string; code: string; name: string }
  account: { id: string; name: string } | null
}

export type FinancePayable = {
  id: string
  description: string
  amountCents: number
  outstandingCents: number
  dueDate: string
  competenceDate: string
  status: string
  notes: string | null
  supplier: { id: string; name: string } | null
}

export type FinanceReceivable = {
  id: string
  description: string
  amountCents: number
  outstandingCents: number
  dueDate: string | null
  competenceDate: string
  status: string
  notes: string | null
  customer: { id: string; name: string } | null
}

export type FinanceCustomer = {
  id: string
  name: string
  phone: string | null
  document: string | null
  fiadoBalanceCents: number
}

export type FinanceSupplier = {
  id: string
  name: string
  document: string | null
}

export type FinanceEmployee = {
  id: string
  name: string
  document: string | null
  baseSalaryCents: number
  active: boolean
}

export type FinanceAlert = {
  id: string
  type: string
  status: string
  title: string
  message: string
  dueDate: string | null
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: string
}

export type FinanceCashSession = {
  id: string
  status: string
  openedAt: string
  closedAt: string | null
  openingAmountCents: number
  closingAmountExpectedCents: number | null
  closingAmountCountedCents: number | null
  differenceCents: number | null
  account: { id: string; name: string }
}

export type FinanceRecurringTemplate = {
  id: string
  name: string
  direction: "entrada" | "saida"
  amountCents: number
  interval: "weekly" | "monthly" | "yearly"
  nextRunDate: string
  active: boolean
}

export type FinanceCashFlowPoint = {
  date: string
  realizedInCents: number
  realizedOutCents: number
  projectedInCents: number
  projectedOutCents: number
  realizedNetCents: number
  projectedNetCents: number
}

export type FinancePayrollEvent = {
  id: string
  period: string
  type: string
  description: string
  amountCents: number
  competenceDate: string
  settlementDate: string | null
  employee: { id: string; name: string; document: string | null }
}

export type FinanceFiscalDocument = {
  id: string
  key: string
  number: string | null
  series: string | null
  issuerName: string | null
  direction: "entrada" | "saida"
  issueDate: string
  totalCents: number
  taxes: Array<{ id: string; name: string; amountCents: number }>
}

function withStoreId(path: string, storeId?: string): string {
  if (!storeId) return path
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}storeId=${encodeURIComponent(storeId)}`
}

async function requestFinance<T>(
  path: string,
  init: RequestInit = {},
  storeId?: string
): Promise<T> {
  const res = await fetch(getApiUrl(withStoreId(path, storeId)), {
    ...init,
    headers: {
      ...getAuthHeaders(init.body !== undefined),
      ...(init.headers ?? {}),
    },
  })

  if (!res.ok) {
    let message = `Finance API failed: ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // noop
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function getFinanceBootstrap(storeId?: string) {
  return requestFinance<FinanceBootstrap>("/finance/bootstrap", {}, storeId)
}

export function getFinanceCostCenters(storeId?: string) {
  return requestFinance<FinanceCostCenter[]>("/finance/cost-centers", {}, storeId)
}

export function createFinanceCostCenter(
  payload: { code: string; name: string; active?: boolean },
  storeId?: string
) {
  return requestFinance<FinanceCostCenter>(
    "/finance/cost-centers",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceProcesses(storeId?: string) {
  return requestFinance<FinanceProcess[]>("/finance/processes", {}, storeId)
}

export function createFinanceProcess(
  payload: { code: string; name: string; active?: boolean },
  storeId?: string
) {
  return requestFinance<FinanceProcess>(
    "/finance/processes",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceAccounts(storeId?: string) {
  return requestFinance<FinanceAccount[]>("/finance/accounts", {}, storeId)
}

export function createFinanceAccount(
  payload: { name: string; type?: string; openingBalanceCents?: number; active?: boolean },
  storeId?: string
) {
  return requestFinance<FinanceAccount>(
    "/finance/accounts",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceDashboard(start: string, end: string, storeId?: string) {
  return requestFinance<FinanceDashboard>(
    `/finance/dashboard?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    {},
    storeId
  )
}

export function getFinanceCashFlow(start: string, end: string, storeId?: string) {
  return requestFinance<FinanceCashFlowPoint[]>(
    `/finance/cash-flow?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    {},
    storeId
  )
}

export function getFinanceEntries(start: string, end: string, storeId?: string) {
  return requestFinance<FinanceEntry[]>(
    `/finance/entries?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=500`,
    {},
    storeId
  )
}

export function createFinanceEntry(
  payload: {
    origin: string
    basis: "caixa" | "competencia"
    direction: "entrada" | "saida"
    amountCents: number
    competenceDate: string
    settlementDate: string | null
    status: "draft" | "approved" | "reconciled" | "canceled"
    description?: string
    accountId?: string
    costCenterId?: string
    processId?: string
  },
  storeId?: string
) {
  return requestFinance<FinanceEntry>(
    "/finance/entries",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function updateFinanceEntryStatus(
  id: string,
  status: "draft" | "approved" | "reconciled" | "canceled",
  notes?: string,
  storeId?: string
) {
  return requestFinance<FinanceEntry>(
    `/finance/entries/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, notes: notes ?? null }),
    },
    storeId
  )
}

export function getFinancePayables(storeId?: string) {
  return requestFinance<FinancePayable[]>("/finance/payables", {}, storeId)
}

export function createFinancePayable(
  payload: {
    description: string
    amountCents: number
    dueDate: string
    competenceDate: string
    notes?: string
    supplierId?: string
    costCenterId?: string
    processId?: string
  },
  storeId?: string
) {
  return requestFinance<FinancePayable>(
    "/finance/payables",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function settleFinancePayable(
  payableId: string,
  payload: {
    accountId: string
    amountCents: number
    settledAt: string
  },
  storeId?: string
) {
  return requestFinance<FinancePayable>(
    `/finance/payables/${encodeURIComponent(payableId)}/settlements`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceReceivables(storeId?: string) {
  return requestFinance<FinanceReceivable[]>("/finance/receivables", {}, storeId)
}

export function createFinanceReceivable(
  payload: {
    description: string
    amountCents: number
    dueDate: string | null
    competenceDate: string
    notes?: string
    customerId?: string
    costCenterId?: string
    processId?: string
  },
  storeId?: string
) {
  return requestFinance<FinanceReceivable>(
    "/finance/receivables",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function settleFinanceReceivable(
  receivableId: string,
  payload: {
    accountId: string
    amountCents: number
    settledAt: string
  },
  storeId?: string
) {
  return requestFinance<FinanceReceivable>(
    `/finance/receivables/${encodeURIComponent(receivableId)}/settlements`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceCustomers(storeId?: string) {
  return requestFinance<FinanceCustomer[]>("/finance/customers", {}, storeId)
}

export function createFinanceCustomer(
  payload: {
    name: string
    phone?: string
    document?: string
    notes?: string
  },
  storeId?: string
) {
  return requestFinance<FinanceCustomer>(
    "/finance/customers",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceSuppliers(storeId?: string) {
  return requestFinance<FinanceSupplier[]>("/finance/suppliers", {}, storeId)
}

export function createFinanceSupplier(
  payload: {
    name: string
    document?: string
    notes?: string
  },
  storeId?: string
) {
  return requestFinance<FinanceSupplier>(
    "/finance/suppliers",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceEmployees(storeId?: string) {
  return requestFinance<FinanceEmployee[]>("/finance/employees", {}, storeId)
}

export function createFinanceEmployee(
  payload: {
    name: string
    document?: string
    baseSalaryCents?: number
  },
  storeId?: string
) {
  return requestFinance<FinanceEmployee>(
    "/finance/employees",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function importFinancePayroll(
  payload: {
    period: string
    sourceName?: string
    csv: string
    settlementDate?: string | null
    accountId?: string | null
  },
  storeId?: string
) {
  return requestFinance<{ payrollImportId: string; createdEvents: number }>(
    "/finance/payroll/import",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinancePayrollEvents(period?: string, storeId?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : ""
  return requestFinance<FinancePayrollEvent[]>(`/finance/payroll/events${qs}`, {}, storeId)
}

export function getFinanceFiscalRules(storeId?: string) {
  return requestFinance<FinanceBootstrap["taxRules"]>("/finance/fiscal/rules", {}, storeId)
}

export function createFinanceFiscalRule(
  payload: {
    name: string
    type: "imposto" | "taxa"
    appliesTo: "sale" | "payment"
    rateBps: number
    productCategory?: string | null
    paymentMethod?: string | null
    active?: boolean
  },
  storeId?: string
) {
  return requestFinance(
    "/finance/fiscal/rules",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function importFinanceFiscalXml(
  payload: {
    xml: string
    direction: "entrada" | "saida"
  },
  storeId?: string
) {
  return requestFinance(
    "/finance/fiscal/import-xml",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceFiscalDocuments(start: string, end: string, storeId?: string) {
  return requestFinance<FinanceFiscalDocument[]>(
    `/finance/fiscal/documents?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    {},
    storeId
  )
}

export function importFinanceReconciliation(
  payload: {
    accountId: string
    format: "csv" | "ofx"
    fileName?: string
    content: string
  },
  storeId?: string
) {
  return requestFinance<{ importId: string; importedRows: number; matchedRows: number }>(
    "/finance/reconciliation/import",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceReconciliationRows(storeId?: string) {
  return requestFinance<Array<{
    id: string
    occurredAt: string
    description: string
    amountCents: number
    direction: "entrada" | "saida"
    matchStatus: "suggested" | "matched" | "ignored"
    matchedEntryId: string | null
  }>>("/finance/reconciliation/rows", {}, storeId)
}

export function reconcileFinanceRow(
  payload: {
    rowId: string
    entryId?: string | null
  },
  storeId?: string
) {
  return requestFinance(
    "/finance/reconciliation/match",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceCashSessions(storeId?: string) {
  return requestFinance<FinanceCashSession[]>("/finance/cash-sessions", {}, storeId)
}

export function openFinanceCashSession(
  payload: {
    accountId?: string
    openingAmountCents: number
    notes?: string
  },
  storeId?: string
) {
  return requestFinance(
    "/finance/cash-sessions/open",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function addFinanceCashMovement(
  sessionId: string,
  payload: {
    type: "suprimento" | "sangria" | "adjustment" | "sale_collection" | "expense_payment"
    amountCents: number
    description?: string
    direction?: "entrada" | "saida"
  },
  storeId?: string
) {
  return requestFinance(
    `/finance/cash-sessions/${encodeURIComponent(sessionId)}/movements`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function closeFinanceCashSession(
  sessionId: string,
  payload: {
    countedAmountCents: number
    notes?: string
  },
  storeId?: string
) {
  return requestFinance(
    `/finance/cash-sessions/${encodeURIComponent(sessionId)}/close`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function getFinanceRecurring(storeId?: string) {
  return requestFinance<FinanceRecurringTemplate[]>("/finance/recurring", {}, storeId)
}

export function createFinanceRecurring(
  payload: {
    name: string
    direction: "entrada" | "saida"
    amountCents: number
    startDate: string
    endDate?: string | null
    interval: "weekly" | "monthly" | "yearly"
    costCenterId?: string
    processId?: string
    active?: boolean
  },
  storeId?: string
) {
  return requestFinance<FinanceRecurringTemplate>(
    "/finance/recurring",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    storeId
  )
}

export function runFinanceRecurring(runUntil: string, storeId?: string) {
  return requestFinance<{ templatesProcessed: number; generatedPayables: number; generatedReceivables: number }>(
    "/finance/recurring/run",
    {
      method: "POST",
      body: JSON.stringify({ runUntil }),
    },
    storeId
  )
}

export function getFinanceAlerts(storeId?: string) {
  return requestFinance<FinanceAlert[]>("/finance/alerts", {}, storeId)
}

export function runFinanceBackfill(storeId?: string) {
  return requestFinance<{ processed: number }>(
    "/finance/backfill",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    storeId
  )
}

export async function downloadFinanceCsv(path: string, storeId?: string): Promise<Blob> {
  const res = await fetch(getApiUrl(withStoreId(path, storeId)), {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Falha ao exportar CSV: ${res.status}`)
  }
  return res.blob()
}
