"use client"

import { Suspense, useState, useEffect, useMemo, useCallback, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addWeeks,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CalendarIcon,
  Filter,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  CreditCard,
  Printer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import {
  getSales,
  getSaleItems,
  getProducts,
} from "@/lib/db"
import { getReportSales } from "@/lib/api"
import { formatCurrency, formatDate, formatDateLabel } from "@/lib/format"
import { printSaleReceipt } from "@/lib/sale-receipt"
import {
  PAYMENT_METHOD_LABELS,
  PRODUCT_CATEGORY_LABELS,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import type {
  ProductCategory,
  Sale,
  SaleItem,
  PaymentMethod,
} from "@/lib/types"
import { toast } from "sonner"

const READ_ONLY_VIEW = "report"
const TENNIS_VARIANT_SEPARATOR = "::"

type PeriodMode = "range" | "month" | "week"

type ReportSaleItem = SaleItem & {
  productCategory: ProductCategory | null
}

type ReportSale = Sale & {
  items: ReportSaleItem[]
}

type WeekOption = {
  id: string
  from: Date
  to: Date
  label: string
}

const MONTH_OPTIONS = [
  { value: "01", label: "Janeiro" },
  { value: "02", label: "Fevereiro" },
  { value: "03", label: "Marco" },
  { value: "04", label: "Abril" },
  { value: "05", label: "Maio" },
  { value: "06", label: "Junho" },
  { value: "07", label: "Julho" },
  { value: "08", label: "Agosto" },
  { value: "09", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
]

function normalizeProductId(productId: string): string {
  const splitIndex = productId.indexOf(TENNIS_VARIANT_SEPARATOR)
  if (splitIndex <= 0) return productId
  return productId.slice(0, splitIndex)
}

function parseMonthDate(monthValue: string): Date {
  const [yearRaw, monthRaw] = monthValue.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return new Date()
  }

  return new Date(year, month - 1, 1)
}

function buildWeekOptions(monthDate: Date): WeekOption[] {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const options: WeekOption[] = []

  let cursor = startOfWeek(monthStart, { weekStartsOn: 1 })
  let weekNumber = 1

  while (cursor <= monthEnd) {
    const rawEnd = endOfWeek(cursor, { weekStartsOn: 1 })
    const from = cursor < monthStart ? monthStart : cursor
    const to = rawEnd > monthEnd ? monthEnd : rawEnd

    options.push({
      id: String(weekNumber),
      from,
      to,
      label: `Semana ${weekNumber} (${format(from, "dd/MM")} - ${format(to, "dd/MM")})`,
    })

    cursor = addWeeks(cursor, 1)
    weekNumber += 1
  }

  return options
}

export default function RelatoriosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Carregando...</div>}>
      <RelatoriosContent />
    </Suspense>
  )
}

function RelatoriosContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const focusedSaleId = searchParams.get("saleId")
  const focusedSaleDate = searchParams.get("saleDate")

  const readOnly =
    searchParams.get("view") === READ_ONLY_VIEW ||
    process.env.NEXT_PUBLIC_READ_ONLY === "true"

  const [periodMode, setPeriodMode] = useState<PeriodMode>("range")
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), "yyyy-MM")
  )
  const [selectedWeekId, setSelectedWeekId] = useState<string>("1")

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })

  const [sourceSales, setSourceSales] = useState<ReportSale[]>([])
  const [expandedSale, setExpandedSale] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [categoryFilter, setCategoryFilter] = useState<"all" | ProductCategory>("all")
  const [productFilter, setProductFilter] = useState<string>("all")
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentMethod>("all")
  const [searchFilter, setSearchFilter] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [draftCategoryFilter, setDraftCategoryFilter] = useState<"all" | ProductCategory>("all")
  const [draftProductFilter, setDraftProductFilter] = useState<string>("all")
  const [draftPaymentFilter, setDraftPaymentFilter] = useState<"all" | PaymentMethod>("all")
  const [draftSearchFilter, setDraftSearchFilter] = useState("")

  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [useApi, setUseApi] = useState(false)

  const monthDate = useMemo(() => parseMonthDate(selectedMonth), [selectedMonth])
  const weekOptions = useMemo(() => buildWeekOptions(monthDate), [monthDate])
  const selectedMonthParts = useMemo(() => {
    const [yearRaw, monthRaw] = selectedMonth.split("-")
    const now = new Date()
    const year = Number(yearRaw)
    const month = Number(monthRaw)

    const validYear = Number.isFinite(year) ? String(year) : format(now, "yyyy")
    const validMonth =
      Number.isFinite(month) && month >= 1 && month <= 12
        ? String(month).padStart(2, "0")
        : format(now, "MM")

    return { year: validYear, month: validMonth }
  }, [selectedMonth])

  const availableYears = useMemo(() => {
    const years = new Set<number>()
    const currentYear = new Date().getFullYear()
    years.add(currentYear)
    years.add(currentYear - 1)
    years.add(currentYear - 2)
    years.add(currentYear + 1)

    for (const sale of sourceSales) {
      const year = new Date(sale.createdAt).getFullYear()
      if (Number.isFinite(year)) years.add(year)
    }

    if (focusedSaleDate) {
      const year = new Date(focusedSaleDate).getFullYear()
      if (Number.isFinite(year)) years.add(year)
    }

    const selectedYear = Number(selectedMonthParts.year)
    if (Number.isFinite(selectedYear)) years.add(selectedYear)

    return Array.from(years).sort((a, b) => b - a).map(String)
  }, [sourceSales, focusedSaleDate, selectedMonthParts.year])

  useEffect(() => {
    if (!focusedSaleDate) return
    const parsedDate = new Date(focusedSaleDate)
    if (Number.isNaN(parsedDate.getTime())) return

    setPeriodMode("range")
    setDateRange({
      from: startOfDay(parsedDate),
      to: endOfDay(parsedDate),
    })
  }, [focusedSaleDate])

  useEffect(() => {
    if (weekOptions.length === 0) return
    if (!weekOptions.some((week) => week.id === selectedWeekId)) {
      setSelectedWeekId(weekOptions[0].id)
    }
  }, [weekOptions, selectedWeekId])

  useEffect(() => {
    if (periodMode !== "month") return
    setDateRange({
      from: startOfMonth(monthDate),
      to: endOfMonth(monthDate),
    })
  }, [periodMode, monthDate])

  useEffect(() => {
    if (periodMode !== "week") return

    const selectedWeek =
      weekOptions.find((week) => week.id === selectedWeekId) ?? weekOptions[0]

    if (!selectedWeek) return

    setDateRange({
      from: selectedWeek.from,
      to: selectedWeek.to,
    })
  }, [periodMode, selectedWeekId, weekOptions])

  const startISO = useMemo(
    () => startOfDay(dateRange.from).toISOString(),
    [dateRange.from]
  )
  const endISO = useMemo(
    () => endOfDay(dateRange.to).toISOString(),
    [dateRange.to]
  )

  const loadLocalData = useCallback(() => {
    const categoryByProductId = new Map(
      getProducts().map((product) => [product.id, product.category] as const)
    )

    const localSales: ReportSale[] = getSales(startISO, endISO).map((sale) => ({
      ...sale,
      items: getSaleItems(sale.id).map((item) => ({
        ...item,
        productCategory:
          categoryByProductId.get(normalizeProductId(item.productId)) ?? null,
      })),
    }))

    setSourceSales(localSales)
  }, [startISO, endISO])

  useEffect(() => {
    setApiLoading(true)
    setApiError(null)

    getReportSales(startISO, endISO)
      .then((salesRes) => {
        const normalized: ReportSale[] = salesRes.map((sale) => ({
          id: sale.id,
          createdAt: sale.createdAt,
          totalCents: sale.totalCents,
          itemsCount: sale.itemsCount,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          payments: sale.payments,
          items: sale.items.map((item) => ({
            ...item,
            productCategory: item.productCategory ?? null,
          })),
        }))

        setSourceSales(normalized)
        setUseApi(true)
      })
      .catch((e) => {
        setApiError(e instanceof Error ? e.message : String(e))
        setUseApi(false)
        loadLocalData()
      })
      .finally(() => setApiLoading(false))
  }, [startISO, endISO, loadLocalData])

  const productsInRange = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; category: ProductCategory | null }
    >()

    for (const sale of sourceSales) {
      for (const item of sale.items) {
        if (map.has(item.productId)) continue
        map.set(item.productId, {
          id: item.productId,
          name: item.productName,
          category: item.productCategory ?? null,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [sourceSales])

  const availableCategories = useMemo(() => {
    const allCategories = Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]
    const categoriesInRange = new Set(
      productsInRange
        .map((product) => product.category)
        .filter((category): category is ProductCategory => Boolean(category))
    )

    const filtered = allCategories.filter((category) =>
      categoriesInRange.has(category)
    )

    return filtered.length > 0 ? filtered : allCategories
  }, [productsInRange])

  const productsForFilter = useMemo(
    () =>
      productsInRange.filter(
        (product) =>
          categoryFilter === "all" || product.category === categoryFilter
      ),
    [productsInRange, categoryFilter]
  )

  const draftProductsForFilter = useMemo(
    () =>
      productsInRange.filter(
        (product) =>
          draftCategoryFilter === "all" || product.category === draftCategoryFilter
      ),
    [productsInRange, draftCategoryFilter]
  )

  useEffect(() => {
    if (productFilter === "all") return
    if (!productsForFilter.some((product) => product.id === productFilter)) {
      setProductFilter("all")
    }
  }, [productFilter, productsForFilter])

  useEffect(() => {
    if (!filtersOpen) return
    setDraftCategoryFilter(categoryFilter)
    setDraftProductFilter(productFilter)
    setDraftPaymentFilter(paymentFilter)
    setDraftSearchFilter(searchFilter)
  }, [filtersOpen, categoryFilter, productFilter, paymentFilter, searchFilter])

  useEffect(() => {
    if (draftProductFilter === "all") return
    if (!draftProductsForFilter.some((product) => product.id === draftProductFilter)) {
      setDraftProductFilter("all")
    }
  }, [draftProductFilter, draftProductsForFilter])

  const salesData = useMemo(() => {
    const query = searchFilter.trim().toLowerCase()
    const applyItemFilter = categoryFilter !== "all" || productFilter !== "all"

    return sourceSales.flatMap((sale) => {
      if (
        paymentFilter !== "all" &&
        !sale.payments.some((payment) => payment.method === paymentFilter)
      ) {
        return []
      }

      if (query) {
        const customerSearch = `${sale.customerName ?? ""} ${sale.customerPhone ?? ""}`
          .toLowerCase()
          .trim()
        const matchesCustomer = customerSearch.includes(query)
        const matchesAnyItem = sale.items.some((item) => {
          const sku = item.sku ?? ""
          return (
            item.productName.toLowerCase().includes(query) ||
            sku.toLowerCase().includes(query)
          )
        })

        if (!matchesCustomer && !matchesAnyItem) {
          return []
        }
      }

      let filteredItems = sale.items

      if (categoryFilter !== "all") {
        filteredItems = filteredItems.filter(
          (item) => item.productCategory === categoryFilter
        )
      }

      if (productFilter !== "all") {
        filteredItems = filteredItems.filter(
          (item) => item.productId === productFilter
        )
      }

      if (filteredItems.length === 0) {
        return []
      }

      if (!applyItemFilter) {
        return [{
          ...sale,
          items: filteredItems,
        }]
      }

      const filteredTotal = filteredItems.reduce(
        (sum, item) => sum + item.lineTotalCents,
        0
      )
      const filteredItemsCount = filteredItems.reduce(
        (sum, item) => sum + item.qty,
        0
      )

      return [{
        ...sale,
        totalCents: filteredTotal,
        itemsCount: filteredItemsCount,
        items: filteredItems,
      }]
    })
  }, [
    sourceSales,
    paymentFilter,
    searchFilter,
    categoryFilter,
    productFilter,
  ])

  useEffect(() => {
    if (!expandedSale) return
    if (!salesData.some((sale) => sale.id === expandedSale)) {
      setExpandedSale(null)
    }
  }, [expandedSale, salesData])

  useEffect(() => {
    if (!focusedSaleId) return
    if (!salesData.some((sale) => sale.id === focusedSaleId)) return

    setExpandedSale(focusedSaleId)

    const timer = window.setTimeout(() => {
      document
        .getElementById(`sale-row-${focusedSaleId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 120)

    return () => window.clearTimeout(timer)
  }, [focusedSaleId, salesData])

  const dailySummary = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; totalCents: number; salesCount: number; itemsCount: number }
    >()

    for (const sale of salesData) {
      const dateKey = sale.createdAt.slice(0, 10)
      const existing = byDate.get(dateKey)

      if (existing) {
        existing.totalCents += sale.totalCents
        existing.salesCount += 1
        existing.itemsCount += sale.itemsCount
      } else {
        byDate.set(dateKey, {
          date: dateKey,
          totalCents: sale.totalCents,
          salesCount: 1,
          itemsCount: sale.itemsCount,
        })
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [salesData])

  const topProducts = useMemo(() => {
    const byProduct = new Map<
      string,
      { productId: string; productName: string; totalQty: number; totalCents: number }
    >()

    for (const sale of salesData) {
      for (const item of sale.items) {
        const current = byProduct.get(item.productId)

        if (current) {
          current.totalQty += item.qty
          current.totalCents += item.lineTotalCents
          continue
        }

        byProduct.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          totalQty: item.qty,
          totalCents: item.lineTotalCents,
        })
      }
    }

    return Array.from(byProduct.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5)
  }, [salesData])

  const totalRevenue = useMemo(
    () => salesData.reduce((sum, sale) => sum + sale.totalCents, 0),
    [salesData]
  )

  const totalItems = useMemo(
    () => salesData.reduce((sum, sale) => sum + sale.itemsCount, 0),
    [salesData]
  )

  const avgTicket = useMemo(
    () => (salesData.length > 0 ? Math.round(totalRevenue / salesData.length) : 0),
    [totalRevenue, salesData.length]
  )

  const chartData = useMemo(
    () =>
      dailySummary.map((day) => ({
        date: formatDateLabel(day.date),
        total: day.totalCents / 100,
      })),
    [dailySummary]
  )

  function toggleSaleExpand(saleId: string) {
    setExpandedSale((current) => (current === saleId ? null : saleId))
  }

  function handleDateSelect(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) return

    if (!range.to) {
      setDateRange({
        from: startOfDay(range.from),
        to: endOfDay(range.from),
      })
      return
    }

    const from = range.from <= range.to ? range.from : range.to
    const to = range.from <= range.to ? range.to : range.from

    setDateRange({ from, to })
    setCalendarOpen(false)
  }

  function paymentMethodLabel(method: string): string {
    return PAYMENT_METHOD_LABELS[method as PaymentMethod] || method
  }

  const focusedSaleInResults =
    !focusedSaleId || salesData.some((sale) => sale.id === focusedSaleId)

  const activeFiltersCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (productFilter !== "all" ? 1 : 0) +
    (paymentFilter !== "all" ? 1 : 0) +
    (searchFilter.trim() ? 1 : 0)

  function clearAllFilters() {
    setCategoryFilter("all")
    setProductFilter("all")
    setPaymentFilter("all")
    setSearchFilter("")
  }

  function clearAllDraftFilters() {
    setDraftCategoryFilter("all")
    setDraftProductFilter("all")
    setDraftPaymentFilter("all")
    setDraftSearchFilter("")
  }

  function applyDraftFilters() {
    setCategoryFilter(draftCategoryFilter)
    setProductFilter(draftProductFilter)
    setPaymentFilter(draftPaymentFilter)
    setSearchFilter(draftSearchFilter)
    setFiltersOpen(false)
  }

  function handleReprintSale(sale: ReportSale) {
    void printSaleReceipt({
      sale,
      saleItems: sale.items,
      operatorName: user?.name ?? null,
      storeName: user?.store?.name ?? null,
    }).then((result) => {
      if (result.ok) return
      toast.error(result.error || "Nao foi possivel reimprimir o comprovante")
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Relatorios
            </h1>
            <p className="text-sm text-muted-foreground">
              Visao geral das vendas e desempenho
              {readOnly && " (somente leitura)"}
            </p>
          </div>

          {apiLoading && (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          )}

          {!apiLoading && !useApi && (
            <p className="text-sm text-muted-foreground">
              Exibindo dados locais (offline)
            </p>
          )}
        </div>

        {apiError && (
          <p className="text-sm text-destructive">{apiError}</p>
        )}

        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 md:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-wrap xl:items-end xl:gap-2">
              <div className="flex flex-col gap-1 w-full xl:w-[13rem]">
                <span className="text-xs text-muted-foreground">Periodo</span>
                <Select
                  value={periodMode}
                  onValueChange={(value) => {
                    setPeriodMode(value as PeriodMode)
                    setCalendarOpen(false)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="range">Por datas</SelectItem>
                    <SelectItem value="month">Por mes</SelectItem>
                    <SelectItem value="week">Por semana do mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(periodMode === "month" || periodMode === "week") && (
                <div className="flex flex-col gap-1 w-full sm:col-span-1 xl:w-[22rem]">
                  <span className="text-xs text-muted-foreground">Mes de referencia</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={selectedMonthParts.month}
                      onValueChange={(monthValue) =>
                        setSelectedMonth(`${selectedMonthParts.year}-${monthValue}`)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Mes" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((monthOption) => (
                          <SelectItem key={monthOption.value} value={monthOption.value}>
                            {monthOption.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={selectedMonthParts.year}
                      onValueChange={(yearValue) =>
                        setSelectedMonth(`${yearValue}-${selectedMonthParts.month}`)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Ano" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableYears.map((yearValue) => (
                          <SelectItem key={yearValue} value={yearValue}>
                            {yearValue}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {periodMode === "week" && (
                <div className="flex flex-col gap-1 w-full sm:col-span-2 xl:w-[18rem]">
                  <span className="text-xs text-muted-foreground">Semana</span>
                  <Select value={selectedWeekId} onValueChange={setSelectedWeekId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {weekOptions.map((week) => (
                        <SelectItem key={week.id} value={week.id}>
                          {week.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodMode === "range" && (
                <div className="flex flex-col gap-1 w-full sm:col-span-2 xl:w-[22rem]">
                  <span className="text-xs text-muted-foreground">Intervalo</span>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <CalendarIcon className="size-4" />
                        <span className="text-sm truncate">
                          {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} -{" "}
                          {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{ from: dateRange.from, to: dateRange.to }}
                        onSelect={handleDateSelect}
                        numberOfMonths={2}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setFiltersOpen(true)}
              >
                <Filter className="size-4" />
                Filtros
                {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
              </Button>
              {activeFiltersCount > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Periodo ativo:</span>{" "}
            {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} ate{" "}
            {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
          </div>
        </div>

        {!focusedSaleInResults && (
          <p className="text-xs text-amber-600">
            A venda selecionada nao foi encontrada com os filtros atuais.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receita Total
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totalRevenue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendas
            </CardTitle>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {salesData.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Medio
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(avgTicket)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Itens Vendidos
            </CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {totalItems}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma venda no periodo selecionado
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    tickFormatter={(value) => `R$${value}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `R$ ${value.toFixed(2)}`,
                      "Total",
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Bar
                    dataKey="total"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produtos Mais Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma venda no periodo selecionado
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {topProducts.map((topProduct, index) => (
                  <div
                    key={topProduct.productId}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-bold text-muted-foreground w-5 text-right shrink-0">
                        {index + 1}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {topProduct.productName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {topProduct.totalQty} vendido(s)
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground shrink-0 ml-3">
                      {formatCurrency(topProduct.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {salesData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma venda no periodo selecionado
            </p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Data</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesData.map((sale) => (
                    <Fragment key={sale.id}>
                      <TableRow
                        id={`sale-row-${sale.id}`}
                        className={cn(
                          "cursor-pointer hover:bg-accent/50",
                          focusedSaleId === sale.id && "bg-primary/10"
                        )}
                        onClick={() => toggleSaleExpand(sale.id)}
                      >
                        <TableCell className="px-2">
                          {expandedSale === sale.id ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(sale.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {sale.itemsCount} item(ns)
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {sale.payments && sale.payments.length > 0 ? (
                              sale.payments.map((payment, index) => (
                                <Badge
                                  key={`${sale.id}-${payment.method}-${index}`}
                                  variant="outline"
                                  className="text-xs gap-1"
                                >
                                  <CreditCard className="size-3" />
                                  {paymentMethodLabel(payment.method)}
                                  {sale.payments.length > 1 && (
                                    <span className="text-muted-foreground">
                                      {formatCurrency(payment.amountCents)}
                                    </span>
                                  )}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sale.customerName ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm flex items-center gap-1">
                                <User className="size-3 text-muted-foreground" />
                                {sale.customerName}
                              </span>
                              {sale.customerPhone && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="size-3" />
                                  {sale.customerPhone}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(sale.totalCents)}
                        </TableCell>
                      </TableRow>

                      {expandedSale === sale.id && (
                        <TableRow key={`${sale.id}-detail`}>
                          <TableCell colSpan={6} className="bg-muted/30 p-0">
                            <div className="px-8 py-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                  Itens da venda
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => handleReprintSale(sale)}
                                >
                                  <Printer className="mr-1 size-3" />
                                  Reimprimir comprovante
                                </Button>
                              </div>
                              <div className="flex flex-col gap-1">
                                {sale.items.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="text-foreground">
                                      {item.qty}x {item.productName}
                                      {item.sku && (
                                        <span className="text-muted-foreground ml-1">
                                          ({item.sku})
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {formatCurrency(item.lineTotalCents)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Filtros de relatorios</DialogTitle>
            <DialogDescription>
              Aplique filtros adicionais para categoria, produto, pagamento e busca textual.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Categoria</span>
              <Select
                value={draftCategoryFilter}
                onValueChange={(value) =>
                  setDraftCategoryFilter(value as "all" | ProductCategory)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {PRODUCT_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Produto</span>
              <Select value={draftProductFilter} onValueChange={setDraftProductFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {draftProductsForFilter.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Pagamento</span>
              <Select
                value={draftPaymentFilter}
                onValueChange={(value) =>
                  setDraftPaymentFilter(value as "all" | PaymentMethod)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                    (method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Busca</span>
              <Input
                placeholder="Cliente, telefone, nome do produto ou SKU"
                value={draftSearchFilter}
                className="w-full"
                onChange={(event) => setDraftSearchFilter(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={clearAllDraftFilters}>
              Limpar tudo
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={applyDraftFilters}>
                Aplicar filtros
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
