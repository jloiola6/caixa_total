"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  AlertTriangle,
  BadgeDollarSign,
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarDays,
  ClipboardList,
  DatabaseZap,
  Landmark,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"
import { getStoredStoreId } from "@/lib/auth-api"
import { formatCurrency, formatDateShort } from "@/lib/format"
import {
  addFinanceCashMovement,
  closeFinanceCashSession,
  createFinanceAccount,
  createFinanceCostCenter,
  createFinanceCustomer,
  createFinanceEmployee,
  createFinanceEntry,
  createFinanceFiscalRule,
  createFinancePayable,
  createFinanceProcess,
  createFinanceReceivable,
  createFinanceRecurring,
  createFinanceSupplier,
  downloadFinanceCsv,
  getFinanceAccounts,
  getFinanceAlerts,
  getFinanceBootstrap,
  getFinanceCashFlow,
  getFinanceCashSessions,
  getFinanceCostCenters,
  getFinanceCustomers,
  getFinanceDashboard,
  getFinanceEmployees,
  getFinanceEntries,
  getFinanceFiscalDocuments,
  getFinanceFiscalRules,
  getFinancePayables,
  getFinancePayrollEvents,
  getFinanceProcesses,
  getFinanceReceivables,
  getFinanceReconciliationRows,
  getFinanceRecurring,
  getFinanceSuppliers,
  importFinanceFiscalXml,
  importFinancePayroll,
  importFinanceReconciliation,
  openFinanceCashSession,
  reconcileFinanceRow,
  runFinanceBackfill,
  runFinanceRecurring,
  settleFinancePayable,
  settleFinanceReceivable,
  type FinanceAccount,
  type FinanceAlert,
  type FinanceBootstrap,
  type FinanceCashFlowPoint,
  type FinanceCashSession,
  type FinanceCostCenter,
  type FinanceCustomer,
  type FinanceDashboard,
  type FinanceEmployee,
  type FinanceEntry,
  type FinanceFiscalDocument,
  type FinancePayable,
  type FinancePayrollEvent,
  type FinanceProcess,
  type FinanceReceivable,
  type FinanceRecurringTemplate,
  type FinanceSupplier,
} from "@/lib/finance-api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function toWindowStartIso(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00`).toISOString()
}

function toWindowEndIso(dateValue: string): string {
  return new Date(`${dateValue}T23:59:59.999`).toISOString()
}

function parseCurrencyToCents(value: string): number {
  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^\d,.-]/g, "")
  if (!cleaned) return 0

  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  const decimalSeparator =
    lastComma > lastDot ? "," : lastDot > lastComma ? "." : null

  let normalized = cleaned
  if (decimalSeparator) {
    if (decimalSeparator === ",") {
      normalized = normalized.replace(/\./g, "").replace(",", ".")
    } else {
      normalized = normalized.replace(/,/g, "")
    }
  } else {
    normalized = normalized.replace(/[.,]/g, "")
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function MetricCard({
  title,
  value,
  icon,
  subtle,
}: {
  title: string
  value: string
  icon: React.ReactNode
  subtle?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        {subtle ? <p className="text-xs text-muted-foreground">{subtle}</p> : null}
      </CardContent>
    </Card>
  )
}

export default function FinanceiroPage() {
  const { user } = useAuth()

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd", { locale: ptBR }), [])
  const thirtyDaysAgo = useMemo(
    () => format(subDays(new Date(), 30), "yyyy-MM-dd", { locale: ptBR }),
    []
  )

  const [periodStart, setPeriodStart] = useState(thirtyDaysAgo)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [superAdminStoreId, setSuperAdminStoreId] = useState("")

  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [bootstrap, setBootstrap] = useState<FinanceBootstrap | null>(null)
  const [dashboard, setDashboard] = useState<FinanceDashboard | null>(null)
  const [entries, setEntries] = useState<FinanceEntry[]>([])
  const [payables, setPayables] = useState<FinancePayable[]>([])
  const [receivables, setReceivables] = useState<FinanceReceivable[]>([])
  const [customers, setCustomers] = useState<FinanceCustomer[]>([])
  const [suppliers, setSuppliers] = useState<FinanceSupplier[]>([])
  const [employees, setEmployees] = useState<FinanceEmployee[]>([])
  const [alerts, setAlerts] = useState<FinanceAlert[]>([])
  const [cashSessions, setCashSessions] = useState<FinanceCashSession[]>([])
  const [recurring, setRecurring] = useState<FinanceRecurringTemplate[]>([])
  const [reconciliationRows, setReconciliationRows] = useState<
    Array<{
      id: string
      occurredAt: string
      description: string
      amountCents: number
      direction: "entrada" | "saida"
      matchStatus: "suggested" | "matched" | "ignored"
      matchedEntryId: string | null
    }>
  >([])
  const [fiscalRules, setFiscalRules] = useState<FinanceBootstrap["taxRules"]>([])
  const [cashFlow, setCashFlow] = useState<FinanceCashFlowPoint[]>([])
  const [payrollEvents, setPayrollEvents] = useState<FinancePayrollEvent[]>([])
  const [fiscalDocuments, setFiscalDocuments] = useState<FinanceFiscalDocument[]>([])
  const [costCenters, setCostCenters] = useState<FinanceCostCenter[]>([])
  const [processes, setProcesses] = useState<FinanceProcess[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])

  const [manualEntryForm, setManualEntryForm] = useState({
    origin: "adjustment",
    basis: "caixa",
    direction: "entrada",
    amount: "",
    competenceDate: today,
    settlementDate: today,
    status: "approved",
    description: "",
  })

  const [payableForm, setPayableForm] = useState({
    description: "",
    amount: "",
    dueDate: today,
    competenceDate: today,
    supplierId: "",
    notes: "",
  })

  const [receivableForm, setReceivableForm] = useState({
    description: "",
    amount: "",
    dueDate: "",
    competenceDate: today,
    customerId: "",
    notes: "",
  })

  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    document: "",
    notes: "",
  })

  const [supplierForm, setSupplierForm] = useState({
    name: "",
    document: "",
    notes: "",
  })

  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    document: "",
    baseSalary: "",
  })

  const [openCashForm, setOpenCashForm] = useState({
    accountId: "",
    openingAmount: "",
    notes: "",
  })

  const [movementForm, setMovementForm] = useState({
    sessionId: "",
    type: "suprimento",
    amount: "",
    direction: "entrada",
    description: "",
  })

  const [closeCashForm, setCloseCashForm] = useState({
    sessionId: "",
    countedAmount: "",
    notes: "",
  })

  const [recurringForm, setRecurringForm] = useState({
    name: "",
    direction: "saida",
    amount: "",
    interval: "monthly",
    startDate: today,
    endDate: "",
    costCenterId: "",
    processId: "",
  })

  const [recurringRunUntil, setRecurringRunUntil] = useState(today)

  const [payrollImportForm, setPayrollImportForm] = useState({
    period: format(new Date(), "yyyy-MM"),
    sourceName: "manual_import",
    csv: "",
    settlementDate: today,
    accountId: "",
  })

  const [fiscalRuleForm, setFiscalRuleForm] = useState({
    name: "",
    type: "imposto",
    appliesTo: "sale",
    rateBps: "",
    productCategory: "",
    paymentMethod: "",
    active: true,
  })

  const [fiscalImportForm, setFiscalImportForm] = useState({
    direction: "saida",
    xml: "",
  })

  const [reconciliationImportForm, setReconciliationImportForm] = useState({
    accountId: "",
    format: "csv",
    fileName: "",
    content: "",
  })

  const [costCenterForm, setCostCenterForm] = useState({
    code: "",
    name: "",
  })

  const [processForm, setProcessForm] = useState({
    code: "",
    name: "",
  })

  const [accountForm, setAccountForm] = useState({
    name: "",
    type: "cash",
    openingBalance: "",
  })

  const startIso = useMemo(() => toWindowStartIso(periodStart), [periodStart])
  const endIso = useMemo(() => toWindowEndIso(periodEnd), [periodEnd])

  const storeId =
    user?.role === "SUPER_ADMIN" ? superAdminStoreId.trim() || undefined : undefined

  const superAdminNeedsStoreId = user?.role === "SUPER_ADMIN" && !storeId

  const openSessions = useMemo(
    () => cashSessions.filter((session) => session.status === "open"),
    [cashSessions]
  )

  useEffect(() => {
    if (user?.role !== "SUPER_ADMIN") return
    setSuperAdminStoreId((prev) => prev || getStoredStoreId() || "")
  }, [user?.role])

  useEffect(() => {
    if (!bootstrap) return

    const defaultAccountId = bootstrap.defaults.accountId
    const defaultCostCenterId = bootstrap.defaults.costCenterId
    const defaultProcessId = bootstrap.defaults.processId

    setOpenCashForm((prev) => ({
      ...prev,
      accountId: prev.accountId || defaultAccountId,
    }))

    setPayrollImportForm((prev) => ({
      ...prev,
      accountId: prev.accountId || defaultAccountId,
    }))

    setReconciliationImportForm((prev) => ({
      ...prev,
      accountId: prev.accountId || defaultAccountId,
    }))

    setRecurringForm((prev) => ({
      ...prev,
      costCenterId: prev.costCenterId || defaultCostCenterId,
      processId: prev.processId || defaultProcessId,
    }))
  }, [bootstrap])

  async function withBusyState(key: string, fn: () => Promise<void>) {
    setBusyKey(key)
    try {
      await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao executar operação"
      toast.error(message)
      throw err
    } finally {
      setBusyKey((current) => (current === key ? null : current))
    }
  }

  async function refreshAll(showToast = false) {
    if (superAdminNeedsStoreId) {
      setError("Informe o storeId para consultar os dados financeiros como SUPER_ADMIN.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [
        bootstrapData,
        dashboardData,
        entriesData,
        payablesData,
        receivablesData,
        customersData,
        suppliersData,
        employeesData,
        alertsData,
        cashSessionsData,
        recurringData,
        reconciliationData,
        fiscalRulesData,
        cashFlowData,
        payrollEventsData,
        fiscalDocsData,
        costCentersData,
        processesData,
        accountsData,
      ] = await Promise.all([
        getFinanceBootstrap(storeId),
        getFinanceDashboard(startIso, endIso, storeId),
        getFinanceEntries(startIso, endIso, storeId),
        getFinancePayables(storeId),
        getFinanceReceivables(storeId),
        getFinanceCustomers(storeId),
        getFinanceSuppliers(storeId),
        getFinanceEmployees(storeId),
        getFinanceAlerts(storeId),
        getFinanceCashSessions(storeId),
        getFinanceRecurring(storeId),
        getFinanceReconciliationRows(storeId),
        getFinanceFiscalRules(storeId),
        getFinanceCashFlow(startIso, endIso, storeId),
        getFinancePayrollEvents(undefined, storeId),
        getFinanceFiscalDocuments(startIso, endIso, storeId),
        getFinanceCostCenters(storeId),
        getFinanceProcesses(storeId),
        getFinanceAccounts(storeId),
      ])

      setBootstrap(bootstrapData)
      setDashboard(dashboardData)
      setEntries(entriesData)
      setPayables(payablesData)
      setReceivables(receivablesData)
      setCustomers(customersData)
      setSuppliers(suppliersData)
      setEmployees(employeesData)
      setAlerts(alertsData)
      setCashSessions(cashSessionsData)
      setRecurring(recurringData)
      setReconciliationRows(reconciliationData)
      setFiscalRules(fiscalRulesData)
      setCashFlow(cashFlowData)
      setPayrollEvents(payrollEventsData)
      setFiscalDocuments(fiscalDocsData)
      setCostCenters(costCentersData)
      setProcesses(processesData)
      setAccounts(accountsData)

      if (showToast) {
        toast.success("Dados financeiros atualizados")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar módulo financeiro"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.id) return
    if (superAdminNeedsStoreId) return
    void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, storeId, startIso, endIso])

  async function handleExport(path: string, filename: string) {
    await withBusyState(`export:${path}`, async () => {
      const blob = await downloadFinanceCsv(path, storeId)
      downloadBlob(blob, filename)
      toast.success("Exportação concluída")
    })
  }

  async function handleCreateManualEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const amountCents = parseCurrencyToCents(manualEntryForm.amount)
    if (amountCents <= 0) {
      toast.error("Informe um valor válido para o lançamento")
      return
    }

    await withBusyState("create-manual-entry", async () => {
      await createFinanceEntry(
        {
          origin: manualEntryForm.origin,
          basis: manualEntryForm.basis as "caixa" | "competencia",
          direction: manualEntryForm.direction as "entrada" | "saida",
          amountCents,
          competenceDate: toWindowStartIso(manualEntryForm.competenceDate),
          settlementDate:
            manualEntryForm.basis === "caixa" && manualEntryForm.settlementDate
              ? toWindowEndIso(manualEntryForm.settlementDate)
              : null,
          status: manualEntryForm.status as "draft" | "approved" | "reconciled" | "canceled",
          description: manualEntryForm.description || undefined,
          accountId:
            manualEntryForm.basis === "caixa"
              ? bootstrap?.defaults.accountId
              : undefined,
          costCenterId: bootstrap?.defaults.costCenterId,
          processId: bootstrap?.defaults.processId,
        },
        storeId
      )

      setManualEntryForm((prev) => ({
        ...prev,
        amount: "",
        description: "",
      }))

      await refreshAll()
      toast.success("Lançamento manual criado")
    })
  }

  async function handleCreatePayable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const amountCents = parseCurrencyToCents(payableForm.amount)
    if (amountCents <= 0) {
      toast.error("Informe um valor válido para a conta a pagar")
      return
    }

    await withBusyState("create-payable", async () => {
      await createFinancePayable(
        {
          description: payableForm.description,
          amountCents,
          dueDate: toWindowEndIso(payableForm.dueDate),
          competenceDate: toWindowStartIso(payableForm.competenceDate),
          notes: payableForm.notes || undefined,
          supplierId: payableForm.supplierId || undefined,
          costCenterId: bootstrap?.defaults.costCenterId,
          processId: bootstrap?.defaults.processId,
        },
        storeId
      )

      setPayableForm((prev) => ({
        ...prev,
        description: "",
        amount: "",
        notes: "",
      }))

      await refreshAll()
      toast.success("Conta a pagar cadastrada")
    })
  }

  async function handleSettlePayable(payable: FinancePayable) {
    const accountId = bootstrap?.defaults.accountId
    if (!accountId) {
      toast.error("Conta financeira padrão não encontrada")
      return
    }

    await withBusyState(`settle-payable:${payable.id}`, async () => {
      await settleFinancePayable(
        payable.id,
        {
          accountId,
          amountCents: payable.outstandingCents,
          settledAt: new Date().toISOString(),
        },
        storeId
      )
      await refreshAll()
      toast.success("Conta a pagar baixada")
    })
  }

  async function handleCreateReceivable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const amountCents = parseCurrencyToCents(receivableForm.amount)
    if (amountCents <= 0) {
      toast.error("Informe um valor válido para a conta a receber")
      return
    }

    await withBusyState("create-receivable", async () => {
      await createFinanceReceivable(
        {
          description: receivableForm.description,
          amountCents,
          dueDate: receivableForm.dueDate ? toWindowEndIso(receivableForm.dueDate) : null,
          competenceDate: toWindowStartIso(receivableForm.competenceDate),
          notes: receivableForm.notes || undefined,
          customerId: receivableForm.customerId || undefined,
          costCenterId: bootstrap?.defaults.costCenterId,
          processId: bootstrap?.defaults.processId,
        },
        storeId
      )

      setReceivableForm((prev) => ({
        ...prev,
        description: "",
        amount: "",
        notes: "",
      }))

      await refreshAll()
      toast.success("Conta a receber cadastrada")
    })
  }

  async function handleSettleReceivable(receivable: FinanceReceivable) {
    const accountId = bootstrap?.defaults.accountId
    if (!accountId) {
      toast.error("Conta financeira padrão não encontrada")
      return
    }

    await withBusyState(`settle-receivable:${receivable.id}`, async () => {
      await settleFinanceReceivable(
        receivable.id,
        {
          accountId,
          amountCents: receivable.outstandingCents,
          settledAt: new Date().toISOString(),
        },
        storeId
      )

      await refreshAll()
      toast.success("Recebimento confirmado")
    })
  }

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-customer", async () => {
      await createFinanceCustomer(
        {
          name: customerForm.name,
          phone: customerForm.phone || undefined,
          document: customerForm.document || undefined,
          notes: customerForm.notes || undefined,
        },
        storeId
      )

      setCustomerForm({
        name: "",
        phone: "",
        document: "",
        notes: "",
      })

      await refreshAll()
      toast.success("Cliente financeiro criado")
    })
  }

  async function handleCreateSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-supplier", async () => {
      await createFinanceSupplier(
        {
          name: supplierForm.name,
          document: supplierForm.document || undefined,
          notes: supplierForm.notes || undefined,
        },
        storeId
      )

      setSupplierForm({
        name: "",
        document: "",
        notes: "",
      })

      await refreshAll()
      toast.success("Fornecedor criado")
    })
  }

  async function handleCreateEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-employee", async () => {
      await createFinanceEmployee(
        {
          name: employeeForm.name,
          document: employeeForm.document || undefined,
          baseSalaryCents: parseCurrencyToCents(employeeForm.baseSalary),
        },
        storeId
      )

      setEmployeeForm({
        name: "",
        document: "",
        baseSalary: "",
      })

      await refreshAll()
      toast.success("Funcionário financeiro criado")
    })
  }

  async function handleOpenCashSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("open-cash-session", async () => {
      await openFinanceCashSession(
        {
          accountId: openCashForm.accountId || undefined,
          openingAmountCents: parseCurrencyToCents(openCashForm.openingAmount),
          notes: openCashForm.notes || undefined,
        },
        storeId
      )

      setOpenCashForm((prev) => ({
        ...prev,
        openingAmount: "",
        notes: "",
      }))

      await refreshAll()
      toast.success("Caixa diário aberto")
    })
  }

  async function handleAddCashMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const amountCents = parseCurrencyToCents(movementForm.amount)
    if (amountCents <= 0) {
      toast.error("Informe um valor válido para o movimento")
      return
    }

    await withBusyState("add-cash-movement", async () => {
      await addFinanceCashMovement(
        movementForm.sessionId,
        {
          type: movementForm.type as
            | "suprimento"
            | "sangria"
            | "adjustment"
            | "sale_collection"
            | "expense_payment",
          amountCents,
          direction: movementForm.direction as "entrada" | "saida",
          description: movementForm.description || undefined,
        },
        storeId
      )

      setMovementForm((prev) => ({
        ...prev,
        amount: "",
        description: "",
      }))

      await refreshAll()
      toast.success("Movimento de caixa registrado")
    })
  }

  async function handleCloseCashSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("close-cash-session", async () => {
      await closeFinanceCashSession(
        closeCashForm.sessionId,
        {
          countedAmountCents: parseCurrencyToCents(closeCashForm.countedAmount),
          notes: closeCashForm.notes || undefined,
        },
        storeId
      )

      setCloseCashForm((prev) => ({
        ...prev,
        countedAmount: "",
        notes: "",
      }))

      await refreshAll()
      toast.success("Caixa diário fechado")
    })
  }

  async function handleCreateRecurring(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const amountCents = parseCurrencyToCents(recurringForm.amount)
    if (amountCents <= 0) {
      toast.error("Informe um valor válido para a recorrência")
      return
    }

    await withBusyState("create-recurring", async () => {
      await createFinanceRecurring(
        {
          name: recurringForm.name,
          direction: recurringForm.direction as "entrada" | "saida",
          amountCents,
          startDate: toWindowStartIso(recurringForm.startDate),
          endDate: recurringForm.endDate ? toWindowEndIso(recurringForm.endDate) : null,
          interval: recurringForm.interval as "weekly" | "monthly" | "yearly",
          costCenterId: recurringForm.costCenterId || undefined,
          processId: recurringForm.processId || undefined,
          active: true,
        },
        storeId
      )

      setRecurringForm((prev) => ({
        ...prev,
        name: "",
        amount: "",
      }))

      await refreshAll()
      toast.success("Recorrência criada")
    })
  }

  async function handleRunRecurring() {
    await withBusyState("run-recurring", async () => {
      await runFinanceRecurring(toWindowEndIso(recurringRunUntil), storeId)
      await refreshAll()
      toast.success("Recorrências processadas")
    })
  }

  async function handleImportPayroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!payrollImportForm.csv.trim()) {
      toast.error("Cole o conteúdo CSV da folha")
      return
    }

    await withBusyState("import-payroll", async () => {
      await importFinancePayroll(
        {
          period: payrollImportForm.period,
          sourceName: payrollImportForm.sourceName || undefined,
          csv: payrollImportForm.csv,
          settlementDate: payrollImportForm.settlementDate
            ? toWindowEndIso(payrollImportForm.settlementDate)
            : null,
          accountId: payrollImportForm.accountId || null,
        },
        storeId
      )

      setPayrollImportForm((prev) => ({
        ...prev,
        csv: "",
      }))

      await refreshAll()
      toast.success("Folha importada com sucesso")
    })
  }

  async function handleCreateFiscalRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-fiscal-rule", async () => {
      await createFinanceFiscalRule(
        {
          name: fiscalRuleForm.name,
          type: fiscalRuleForm.type as "imposto" | "taxa",
          appliesTo: fiscalRuleForm.appliesTo as "sale" | "payment",
          rateBps: Math.max(0, Number(fiscalRuleForm.rateBps) || 0),
          productCategory: fiscalRuleForm.productCategory || null,
          paymentMethod: fiscalRuleForm.paymentMethod || null,
          active: fiscalRuleForm.active,
        },
        storeId
      )

      setFiscalRuleForm((prev) => ({
        ...prev,
        name: "",
        rateBps: "",
      }))

      await refreshAll()
      toast.success("Regra fiscal criada")
    })
  }

  async function handleImportFiscalXml(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!fiscalImportForm.xml.trim()) {
      toast.error("Cole um XML válido para importar")
      return
    }

    await withBusyState("import-fiscal-xml", async () => {
      await importFinanceFiscalXml(
        {
          xml: fiscalImportForm.xml,
          direction: fiscalImportForm.direction as "entrada" | "saida",
        },
        storeId
      )

      setFiscalImportForm((prev) => ({
        ...prev,
        xml: "",
      }))

      await refreshAll()
      toast.success("XML fiscal importado")
    })
  }

  async function handleImportReconciliation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!reconciliationImportForm.content.trim()) {
      toast.error("Cole o conteúdo do extrato para conciliar")
      return
    }

    await withBusyState("import-reconciliation", async () => {
      await importFinanceReconciliation(
        {
          accountId: reconciliationImportForm.accountId,
          format: reconciliationImportForm.format as "csv" | "ofx",
          fileName: reconciliationImportForm.fileName || undefined,
          content: reconciliationImportForm.content,
        },
        storeId
      )

      setReconciliationImportForm((prev) => ({
        ...prev,
        fileName: "",
        content: "",
      }))

      await refreshAll()
      toast.success("Importação de conciliação concluída")
    })
  }

  async function handleReconcileRow(rowId: string) {
    const entryId = window.prompt(
      "Informe o ID do lançamento financeiro para parear (deixe vazio para ignorar):"
    )

    await withBusyState(`reconcile:${rowId}`, async () => {
      await reconcileFinanceRow(
        {
          rowId,
          entryId: entryId?.trim() ? entryId.trim() : null,
        },
        storeId
      )

      await refreshAll()
      toast.success("Conciliação atualizada")
    })
  }

  async function handleCreateCostCenter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-cost-center", async () => {
      await createFinanceCostCenter(
        {
          code: costCenterForm.code.trim().toUpperCase(),
          name: costCenterForm.name.trim(),
          active: true,
        },
        storeId
      )

      setCostCenterForm({ code: "", name: "" })
      await refreshAll()
      toast.success("Centro de custo criado")
    })
  }

  async function handleCreateProcess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-process", async () => {
      await createFinanceProcess(
        {
          code: processForm.code.trim().toUpperCase(),
          name: processForm.name.trim(),
          active: true,
        },
        storeId
      )

      setProcessForm({ code: "", name: "" })
      await refreshAll()
      toast.success("Processo criado")
    })
  }

  async function handleCreateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    await withBusyState("create-account", async () => {
      await createFinanceAccount(
        {
          name: accountForm.name.trim(),
          type: accountForm.type.trim() || "cash",
          openingBalanceCents: parseCurrencyToCents(accountForm.openingBalance),
          active: true,
        },
        storeId
      )

      setAccountForm({ name: "", type: "cash", openingBalance: "" })
      await refreshAll()
      toast.success("Conta financeira criada")
    })
  }

  async function handleBackfill() {
    await withBusyState("backfill", async () => {
      await runFinanceBackfill(storeId)
      await refreshAll()
      toast.success("Backfill financeiro concluído")
    })
  }

  const topAlerts = alerts.slice(0, 10)
  const recentEntries = entries.slice(0, 20)

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
            <p className="text-sm text-muted-foreground">
              Controle completo de entradas, saídas, caixa diário, fiscal, folha e conciliação.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void refreshAll(true)}
              disabled={loading || !!busyKey || superAdminNeedsStoreId}
            >
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void handleExport(
                  `/finance/export/entries.csv?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
                  `finance_entries_${periodStart}_${periodEnd}.csv`
                )
              }
              disabled={!!busyKey || superAdminNeedsStoreId}
            >
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void handleExport(
                  `/finance/export/dre.csv?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
                  `finance_dre_${periodStart}_${periodEnd}.xls`
                )
              }
              disabled={!!busyKey || superAdminNeedsStoreId}
            >
              Exportar Excel
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void handleExport(
                  `/finance/export/accounting-layout.csv?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
                  `finance_layout_contabil_${periodStart}_${periodEnd}.csv`
                )
              }
              disabled={!!busyKey || superAdminNeedsStoreId}
            >
              Layout Contábil
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={superAdminNeedsStoreId}
            >
              Exportar PDF
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleBackfill()}
              disabled={busyKey === "backfill" || superAdminNeedsStoreId}
            >
              <DatabaseZap className="mr-2 size-4" />
              Backfill
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-4">
              {user?.role === "SUPER_ADMIN" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="finance-store-id">Store ID (super admin)</Label>
                  <Input
                    id="finance-store-id"
                    value={superAdminStoreId}
                    onChange={(event) => setSuperAdminStoreId(event.target.value)}
                    placeholder="Informe o UUID da loja"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="finance-start">Período inicial</Label>
                <Input
                  id="finance-start"
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="finance-end">Período final</Label>
                <Input
                  id="finance-end"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </div>
            </div>

            {superAdminNeedsStoreId ? (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                Informe o `storeId` para carregar os dados financeiros desta tela.
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="w-full justify-start overflow-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="caixa">Caixa Diário</TabsTrigger>
          <TabsTrigger value="pagar">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receber">Receber/Clientes</TabsTrigger>
          <TabsTrigger value="folha">Folha</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Caixa líquido"
              value={formatCurrency(dashboard?.cash.netCents ?? 0)}
              icon={<Wallet className="size-5" />}
              subtle={`Entradas ${formatCurrency(dashboard?.cash.inCents ?? 0)} | Saídas ${formatCurrency(
                dashboard?.cash.outCents ?? 0
              )}`}
            />
            <MetricCard
              title="Competência líquida"
              value={formatCurrency(dashboard?.competence.netCents ?? 0)}
              icon={<BadgeDollarSign className="size-5" />}
              subtle={`Entradas ${formatCurrency(
                dashboard?.competence.inCents ?? 0
              )} | Saídas ${formatCurrency(dashboard?.competence.outCents ?? 0)}`}
            />
            <MetricCard
              title="Resultado DRE"
              value={formatCurrency(dashboard?.dre.netResultCents ?? 0)}
              icon={<ClipboardList className="size-5" />}
              subtle={`Margem ${(dashboard?.dre.marginBps ?? 0) / 100}%`}
            />
            <MetricCard
              title="Fluxo projetado"
              value={formatCurrency(dashboard?.projected.netCents ?? 0)}
              icon={<CalendarDays className="size-5" />}
              subtle={`Receber ${formatCurrency(
                dashboard?.projected.receivablesCents ?? 0
              )} | Pagar ${formatCurrency(dashboard?.projected.payablesCents ?? 0)}`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="size-5" />
                  Alertas Financeiros
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum alerta em aberto.</p>
                ) : (
                  <div className="space-y-2">
                    {topAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-md border p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{alert.title}</div>
                          <Badge variant="outline">{alert.type}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{alert.message}</p>
                        {alert.dueDate ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Vencimento: {formatDateShort(alert.dueDate)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="size-5" />
                  Fluxo Diário (Caixa/Projetado)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Realizado</TableHead>
                        <TableHead>Projetado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashFlow.slice(0, 20).map((point) => (
                        <TableRow key={point.date}>
                          <TableCell>{formatDateShort(`${point.date}T00:00:00.000Z`)}</TableCell>
                          <TableCell>{formatCurrency(point.realizedNetCents)}</TableCell>
                          <TableCell>{formatCurrency(point.projectedNetCents)}</TableCell>
                        </TableRow>
                      ))}
                      {cashFlow.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Sem dados para o período.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="size-5" />
                Lançamentos Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data competência</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Direção</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDateShort(entry.competenceDate)}</TableCell>
                        <TableCell>{entry.origin}</TableCell>
                        <TableCell>{entry.basis}</TableCell>
                        <TableCell>
                          <Badge variant={entry.direction === "entrada" ? "default" : "secondary"}>
                            {entry.direction}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.status}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.amountCents)}</TableCell>
                      </TableRow>
                    ))}
                    {recentEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Nenhum lançamento financeiro encontrado.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="caixa" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Abrir Caixa Diário</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleOpenCashSession(event)}>
                  <div className="space-y-2">
                    <Label>Conta financeira</Label>
                    <Select
                      value={openCashForm.accountId}
                      onValueChange={(value) =>
                        setOpenCashForm((prev) => ({ ...prev, accountId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor de abertura (R$)</Label>
                    <Input
                      value={openCashForm.openingAmount}
                      onChange={(event) =>
                        setOpenCashForm((prev) => ({
                          ...prev,
                          openingAmount: event.target.value,
                        }))
                      }
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={openCashForm.notes}
                      onChange={(event) =>
                        setOpenCashForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "open-cash-session"}>
                    Abrir sessão
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Movimento de Caixa</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleAddCashMovement(event)}>
                  <div className="space-y-2">
                    <Label>Sessão aberta</Label>
                    <Select
                      value={movementForm.sessionId}
                      onValueChange={(value) =>
                        setMovementForm((prev) => ({ ...prev, sessionId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {openSessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            {session.account.name} | {formatDateShort(session.openedAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={movementForm.type}
                      onValueChange={(value) =>
                        setMovementForm((prev) => ({ ...prev, type: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suprimento">Suprimento</SelectItem>
                        <SelectItem value="sangria">Sangria</SelectItem>
                        <SelectItem value="adjustment">Ajuste</SelectItem>
                        <SelectItem value="sale_collection">Recebimento de venda</SelectItem>
                        <SelectItem value="expense_payment">Pagamento de despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Direção</Label>
                      <Select
                        value={movementForm.direction}
                        onValueChange={(value) =>
                          setMovementForm((prev) => ({ ...prev, direction: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Input
                        value={movementForm.amount}
                        onChange={(event) =>
                          setMovementForm((prev) => ({ ...prev, amount: event.target.value }))
                        }
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={movementForm.description}
                      onChange={(event) =>
                        setMovementForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "add-cash-movement"}>
                    Registrar movimento
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fechar Caixa Diário</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCloseCashSession(event)}>
                  <div className="space-y-2">
                    <Label>Sessão aberta</Label>
                    <Select
                      value={closeCashForm.sessionId}
                      onValueChange={(value) =>
                        setCloseCashForm((prev) => ({ ...prev, sessionId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {openSessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            {session.account.name} | {formatDateShort(session.openedAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor contado (R$)</Label>
                    <Input
                      value={closeCashForm.countedAmount}
                      onChange={(event) =>
                        setCloseCashForm((prev) => ({
                          ...prev,
                          countedAmount: event.target.value,
                        }))
                      }
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={closeCashForm.notes}
                      onChange={(event) =>
                        setCloseCashForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "close-cash-session"}>
                    Fechar sessão
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sessões de Caixa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Fechamento</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashSessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>{session.account.name}</TableCell>
                        <TableCell>
                          <Badge variant={session.status === "open" ? "default" : "outline"}>
                            {session.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(session.openingAmountCents)}</TableCell>
                        <TableCell>
                          {session.closingAmountCountedCents !== null
                            ? formatCurrency(session.closingAmountCountedCents)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {session.differenceCents !== null ? formatCurrency(session.differenceCents) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {cashSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Nenhuma sessão de caixa encontrada.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagar" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Nova Conta a Pagar</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreatePayable(event)}>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={payableForm.description}
                      onChange={(event) =>
                        setPayableForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Input
                        value={payableForm.amount}
                        onChange={(event) =>
                          setPayableForm((prev) => ({ ...prev, amount: event.target.value }))
                        }
                        placeholder="0,00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fornecedor</Label>
                      <Select
                        value={payableForm.supplierId || "none"}
                        onValueChange={(value) =>
                          setPayableForm((prev) => ({
                            ...prev,
                            supplierId: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem fornecedor</SelectItem>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Vencimento</Label>
                      <Input
                        type="date"
                        value={payableForm.dueDate}
                        onChange={(event) =>
                          setPayableForm((prev) => ({ ...prev, dueDate: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Competência</Label>
                      <Input
                        type="date"
                        value={payableForm.competenceDate}
                        onChange={(event) =>
                          setPayableForm((prev) => ({ ...prev, competenceDate: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={payableForm.notes}
                      onChange={(event) =>
                        setPayableForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-payable"}>
                    Cadastrar conta a pagar
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Novo Fornecedor</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateSupplier(event)}>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={supplierForm.name}
                      onChange={(event) =>
                        setSupplierForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Documento</Label>
                    <Input
                      value={supplierForm.document}
                      onChange={(event) =>
                        setSupplierForm((prev) => ({ ...prev, document: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={supplierForm.notes}
                      onChange={(event) =>
                        setSupplierForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-supplier"}>
                    Criar fornecedor
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Contas a Pagar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables.map((payable) => (
                      <TableRow key={payable.id}>
                        <TableCell>{payable.description}</TableCell>
                        <TableCell>{payable.supplier?.name ?? "-"}</TableCell>
                        <TableCell>{formatDateShort(payable.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant={payable.status === "overdue" ? "destructive" : "outline"}>
                            {payable.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(payable.outstandingCents)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleSettlePayable(payable)}
                            disabled={payable.outstandingCents <= 0 || busyKey === `settle-payable:${payable.id}`}
                          >
                            Quitar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {payables.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Nenhuma conta a pagar cadastrada.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receber" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Nova Conta a Receber</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateReceivable(event)}>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={receivableForm.description}
                      onChange={(event) =>
                        setReceivableForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Input
                        value={receivableForm.amount}
                        onChange={(event) =>
                          setReceivableForm((prev) => ({ ...prev, amount: event.target.value }))
                        }
                        placeholder="0,00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cliente</Label>
                      <Select
                        value={receivableForm.customerId || "none"}
                        onValueChange={(value) =>
                          setReceivableForm((prev) => ({
                            ...prev,
                            customerId: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem cliente</SelectItem>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Vencimento (opcional)</Label>
                      <Input
                        type="date"
                        value={receivableForm.dueDate}
                        onChange={(event) =>
                          setReceivableForm((prev) => ({ ...prev, dueDate: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Competência</Label>
                      <Input
                        type="date"
                        value={receivableForm.competenceDate}
                        onChange={(event) =>
                          setReceivableForm((prev) => ({ ...prev, competenceDate: event.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={receivableForm.notes}
                      onChange={(event) =>
                        setReceivableForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-receivable"}>
                    Cadastrar conta a receber
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Novo Cliente Financeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateCustomer(event)}>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={customerForm.name}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input
                        value={customerForm.phone}
                        onChange={(event) =>
                          setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Documento</Label>
                      <Input
                        value={customerForm.document}
                        onChange={(event) =>
                          setCustomerForm((prev) => ({ ...prev, document: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={customerForm.notes}
                      onChange={(event) =>
                        setCustomerForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-customer"}>
                    Criar cliente
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contas a Receber</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[26rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Em aberto</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivables.map((receivable) => (
                        <TableRow key={receivable.id}>
                          <TableCell>{receivable.description}</TableCell>
                          <TableCell>{receivable.customer?.name ?? "-"}</TableCell>
                          <TableCell>
                            <Badge variant={receivable.status === "overdue" ? "destructive" : "outline"}>
                              {receivable.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(receivable.outstandingCents)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleSettleReceivable(receivable)}
                              disabled={
                                receivable.outstandingCents <= 0 ||
                                busyKey === `settle-receivable:${receivable.id}`
                              }
                            >
                              Receber
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {receivables.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Nenhuma conta a receber cadastrada.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Clientes e Saldo Fiado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[26rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead className="text-right">Saldo fiado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell>{customer.name}</TableCell>
                          <TableCell>{customer.phone ?? "-"}</TableCell>
                          <TableCell>{customer.document ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(customer.fiadoBalanceCents)}</TableCell>
                        </TableRow>
                      ))}
                      {customers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            Nenhum cliente financeiro cadastrado.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="folha" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Importar Folha (CSV)</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleImportPayroll(event)}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Período</Label>
                      <Input
                        type="month"
                        value={payrollImportForm.period}
                        onChange={(event) =>
                          setPayrollImportForm((prev) => ({ ...prev, period: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fonte</Label>
                      <Input
                        value={payrollImportForm.sourceName}
                        onChange={(event) =>
                          setPayrollImportForm((prev) => ({
                            ...prev,
                            sourceName: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Data de pagamento</Label>
                      <Input
                        type="date"
                        value={payrollImportForm.settlementDate}
                        onChange={(event) =>
                          setPayrollImportForm((prev) => ({
                            ...prev,
                            settlementDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Conta de pagamento</Label>
                      <Select
                        value={payrollImportForm.accountId || "none"}
                        onValueChange={(value) =>
                          setPayrollImportForm((prev) => ({
                            ...prev,
                            accountId: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem baixa em caixa</SelectItem>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>CSV</Label>
                    <Textarea
                      value={payrollImportForm.csv}
                      onChange={(event) =>
                        setPayrollImportForm((prev) => ({ ...prev, csv: event.target.value }))
                      }
                      rows={10}
                      placeholder="nome;documento;tipo;valor;descricao"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "import-payroll"}>
                    Importar folha
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Novo Funcionário</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateEmployee(event)}>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={employeeForm.name}
                      onChange={(event) =>
                        setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Documento</Label>
                    <Input
                      value={employeeForm.document}
                      onChange={(event) =>
                        setEmployeeForm((prev) => ({ ...prev, document: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Salário base (R$)</Label>
                    <Input
                      value={employeeForm.baseSalary}
                      onChange={(event) =>
                        setEmployeeForm((prev) => ({ ...prev, baseSalary: event.target.value }))
                      }
                      placeholder="0,00"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-employee"}>
                    Cadastrar funcionário
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Eventos de Folha</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{event.period}</TableCell>
                        <TableCell>{event.employee.name}</TableCell>
                        <TableCell>{event.type}</TableCell>
                        <TableCell>{event.description}</TableCell>
                        <TableCell className="text-right">{formatCurrency(event.amountCents)}</TableCell>
                      </TableRow>
                    ))}
                    {payrollEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Nenhum evento de folha importado.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fiscal" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Nova Regra Tributária</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateFiscalRule(event)}>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={fiscalRuleForm.name}
                      onChange={(event) =>
                        setFiscalRuleForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={fiscalRuleForm.type}
                        onValueChange={(value) =>
                          setFiscalRuleForm((prev) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="imposto">Imposto</SelectItem>
                          <SelectItem value="taxa">Taxa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Aplicar em</Label>
                      <Select
                        value={fiscalRuleForm.appliesTo}
                        onValueChange={(value) =>
                          setFiscalRuleForm((prev) => ({ ...prev, appliesTo: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sale">Venda</SelectItem>
                          <SelectItem value="payment">Pagamento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Alíquota (bps)</Label>
                    <Input
                      type="number"
                      value={fiscalRuleForm.rateBps}
                      onChange={(event) =>
                        setFiscalRuleForm((prev) => ({ ...prev, rateBps: event.target.value }))
                      }
                      placeholder="Ex.: 350 para 3,5%"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Categoria (opcional)</Label>
                      <Input
                        value={fiscalRuleForm.productCategory}
                        onChange={(event) =>
                          setFiscalRuleForm((prev) => ({
                            ...prev,
                            productCategory: event.target.value,
                          }))
                        }
                        placeholder="roupas, tenis..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Meio de pagamento (opcional)</Label>
                      <Input
                        value={fiscalRuleForm.paymentMethod}
                        onChange={(event) =>
                          setFiscalRuleForm((prev) => ({
                            ...prev,
                            paymentMethod: event.target.value,
                          }))
                        }
                        placeholder="pix, credito..."
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-fiscal-rule"}>
                    Criar regra
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Importar XML Fiscal</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleImportFiscalXml(event)}>
                  <div className="space-y-2">
                    <Label>Direção</Label>
                    <Select
                      value={fiscalImportForm.direction}
                      onValueChange={(value) =>
                        setFiscalImportForm((prev) => ({ ...prev, direction: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Conteúdo XML</Label>
                    <Textarea
                      value={fiscalImportForm.xml}
                      onChange={(event) =>
                        setFiscalImportForm((prev) => ({ ...prev, xml: event.target.value }))
                      }
                      rows={12}
                      placeholder="Cole o conteúdo completo do XML"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "import-fiscal-xml"}>
                    Importar XML
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Regras Fiscais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[24rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Aplicação</TableHead>
                        <TableHead className="text-right">bps</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fiscalRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>{rule.name}</TableCell>
                          <TableCell>{rule.type}</TableCell>
                          <TableCell>{rule.appliesTo}</TableCell>
                          <TableCell className="text-right">{rule.rateBps}</TableCell>
                        </TableRow>
                      ))}
                      {fiscalRules.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            Nenhuma regra fiscal cadastrada.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documentos Fiscais Importados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[24rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Emissão</TableHead>
                        <TableHead>Chave/Numero</TableHead>
                        <TableHead>Direção</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fiscalDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>{formatDateShort(doc.issueDate)}</TableCell>
                          <TableCell>{doc.number ?? doc.key}</TableCell>
                          <TableCell>{doc.direction}</TableCell>
                          <TableCell className="text-right">{formatCurrency(doc.totalCents)}</TableCell>
                        </TableRow>
                      ))}
                      {fiscalDocuments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            Nenhum documento fiscal importado no período.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="conciliacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importar Extrato (CSV/OFX)</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(event) => void handleImportReconciliation(event)}>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Conta financeira</Label>
                    <Select
                      value={reconciliationImportForm.accountId}
                      onValueChange={(value) =>
                        setReconciliationImportForm((prev) => ({
                          ...prev,
                          accountId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Formato</Label>
                    <Select
                      value={reconciliationImportForm.format}
                      onValueChange={(value) =>
                        setReconciliationImportForm((prev) => ({
                          ...prev,
                          format: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="ofx">OFX</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome do arquivo</Label>
                    <Input
                      value={reconciliationImportForm.fileName}
                      onChange={(event) =>
                        setReconciliationImportForm((prev) => ({
                          ...prev,
                          fileName: event.target.value,
                        }))
                      }
                      placeholder="extrato-abril"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo do arquivo</Label>
                  <Textarea
                    value={reconciliationImportForm.content}
                    onChange={(event) =>
                      setReconciliationImportForm((prev) => ({
                        ...prev,
                        content: event.target.value,
                      }))
                    }
                    rows={12}
                    required
                  />
                </div>
                <Button type="submit" disabled={busyKey === "import-reconciliation"}>
                  Importar e conciliar
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Linhas de Conciliação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Direção</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliationRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDateShort(row.occurredAt)}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>{row.direction}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.amountCents)}</TableCell>
                        <TableCell>
                          <Badge variant={row.matchStatus === "matched" ? "default" : "outline"}>
                            {row.matchStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleReconcileRow(row.id)}
                            disabled={busyKey === `reconcile:${row.id}`}
                          >
                            Parear / Ignorar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {reconciliationRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Nenhuma linha de conciliação disponível.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Novo Centro de Custo</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateCostCenter(event)}>
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input
                      value={costCenterForm.code}
                      onChange={(event) =>
                        setCostCenterForm((prev) => ({ ...prev, code: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={costCenterForm.name}
                      onChange={(event) =>
                        setCostCenterForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-cost-center"}>
                    Criar centro
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Novo Processo</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateProcess(event)}>
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input
                      value={processForm.code}
                      onChange={(event) =>
                        setProcessForm((prev) => ({ ...prev, code: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={processForm.name}
                      onChange={(event) =>
                        setProcessForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-process"}>
                    Criar processo
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Nova Conta Financeira</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateAccount(event)}>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={accountForm.name}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Input
                      value={accountForm.type}
                      onChange={(event) =>
                        setAccountForm((prev) => ({ ...prev, type: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Saldo inicial (R$)</Label>
                    <Input
                      value={accountForm.openingBalance}
                      onChange={(event) =>
                        setAccountForm((prev) => ({
                          ...prev,
                          openingBalance: event.target.value,
                        }))
                      }
                      placeholder="0,00"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-account"}>
                    Criar conta
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recorrências</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(event) => void handleCreateRecurring(event)}>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={recurringForm.name}
                      onChange={(event) =>
                        setRecurringForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Direção</Label>
                      <Select
                        value={recurringForm.direction}
                        onValueChange={(value) =>
                          setRecurringForm((prev) => ({ ...prev, direction: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor (R$)</Label>
                      <Input
                        value={recurringForm.amount}
                        onChange={(event) =>
                          setRecurringForm((prev) => ({ ...prev, amount: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Intervalo</Label>
                      <Select
                        value={recurringForm.interval}
                        onValueChange={(value) =>
                          setRecurringForm((prev) => ({ ...prev, interval: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Início</Label>
                      <Input
                        type="date"
                        value={recurringForm.startDate}
                        onChange={(event) =>
                          setRecurringForm((prev) => ({ ...prev, startDate: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fim (opcional)</Label>
                      <Input
                        type="date"
                        value={recurringForm.endDate}
                        onChange={(event) =>
                          setRecurringForm((prev) => ({ ...prev, endDate: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Centro de custo</Label>
                      <Select
                        value={recurringForm.costCenterId || "none"}
                        onValueChange={(value) =>
                          setRecurringForm((prev) => ({
                            ...prev,
                            costCenterId: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Padrão</SelectItem>
                          {costCenters.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.code} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Processo</Label>
                      <Select
                        value={recurringForm.processId || "none"}
                        onValueChange={(value) =>
                          setRecurringForm((prev) => ({
                            ...prev,
                            processId: value === "none" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Padrão</SelectItem>
                          {processes.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.code} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={busyKey === "create-recurring"}>
                    Criar recorrência
                  </Button>
                </form>

                <div className="mt-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end">
                    <div className="w-full space-y-2">
                      <Label>Processar recorrências até</Label>
                      <Input
                        type="date"
                        value={recurringRunUntil}
                        onChange={(event) => setRecurringRunUntil(event.target.value)}
                      />
                    </div>
                    <Button onClick={() => void handleRunRecurring()} disabled={busyKey === "run-recurring"}>
                      Processar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configurações Ativas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Centros de custo</h3>
                  <div className="space-y-1">
                    {costCenters.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <span>{item.code} - {item.name}</span>
                        <Badge variant={item.active ? "default" : "outline"}>{item.active ? "ativo" : "inativo"}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Processos</h3>
                  <div className="space-y-1">
                    {processes.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <span>{item.code} - {item.name}</span>
                        <Badge variant={item.active ? "default" : "outline"}>{item.active ? "ativo" : "inativo"}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Contas financeiras</h3>
                  <div className="space-y-1">
                    {accounts.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">{formatCurrency(item.currentBalanceCents)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Recorrências cadastradas</h3>
                  <div className="space-y-1">
                    {recurring.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                      >
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">
                          {item.direction} | {formatCurrency(item.amountCents)} | {item.interval}
                        </span>
                      </div>
                    ))}
                    {recurring.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem recorrências cadastradas.</p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ajuste Manual de Lançamento</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(event) => void handleCreateManualEntry(event)}>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Select
                      value={manualEntryForm.origin}
                      onValueChange={(value) =>
                        setManualEntryForm((prev) => ({ ...prev, origin: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="adjustment">Ajuste</SelectItem>
                        <SelectItem value="payable">Conta a pagar</SelectItem>
                        <SelectItem value="fiado_receivable">Conta a receber</SelectItem>
                        <SelectItem value="tax">Imposto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Base</Label>
                    <Select
                      value={manualEntryForm.basis}
                      onValueChange={(value) =>
                        setManualEntryForm((prev) => ({ ...prev, basis: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="caixa">Caixa</SelectItem>
                        <SelectItem value="competencia">Competência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Direção</Label>
                    <Select
                      value={manualEntryForm.direction}
                      onValueChange={(value) =>
                        setManualEntryForm((prev) => ({ ...prev, direction: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={manualEntryForm.status}
                      onValueChange={(value) =>
                        setManualEntryForm((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="approved">Aprovado</SelectItem>
                        <SelectItem value="reconciled">Conciliado</SelectItem>
                        <SelectItem value="canceled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      value={manualEntryForm.amount}
                      onChange={(event) =>
                        setManualEntryForm((prev) => ({ ...prev, amount: event.target.value }))
                      }
                      placeholder="0,00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data competência</Label>
                    <Input
                      type="date"
                      value={manualEntryForm.competenceDate}
                      onChange={(event) =>
                        setManualEntryForm((prev) => ({
                          ...prev,
                          competenceDate: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data liquidação</Label>
                    <Input
                      type="date"
                      value={manualEntryForm.settlementDate}
                      onChange={(event) =>
                        setManualEntryForm((prev) => ({
                          ...prev,
                          settlementDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={manualEntryForm.description}
                    onChange={(event) =>
                      setManualEntryForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    rows={2}
                  />
                </div>

                <Button type="submit" disabled={busyKey === "create-manual-entry"}>
                  Criar lançamento manual
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BanknoteArrowUp className="size-5 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">Receita Bruta</p>
              <p className="text-lg font-semibold">{formatCurrency(dashboard?.dre.grossRevenueCents ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BanknoteArrowDown className="size-5 text-rose-500" />
            <div>
              <p className="text-xs text-muted-foreground">CMV + Despesas + Folha</p>
              <p className="text-lg font-semibold">
                {formatCurrency(
                  (dashboard?.dre.cogsCents ?? 0) +
                    (dashboard?.dre.operatingExpensesCents ?? 0) +
                    (dashboard?.dre.payrollCents ?? 0)
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="size-5 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Alertas em aberto</p>
              <p className="text-lg font-semibold">{alerts.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
