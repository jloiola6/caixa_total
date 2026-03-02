"use client"

import { useState, useEffect, useMemo, useCallback, Fragment } from "react"
import { useSearchParams } from "next/navigation"
import { format, subDays, startOfDay, endOfDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CalendarIcon,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  ChevronDown,
  ChevronRight,
  User,
  Phone,
  CreditCard,
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
  getDailySummary,
  getTopProducts,
} from "@/lib/db"
import {
  getReportSummary,
  getReportSales,
  getReportTopProducts,
} from "@/lib/api"
import { formatCurrency, formatDate, formatDateLabel } from "@/lib/format"
import { PAYMENT_METHOD_LABELS } from "@/lib/types"
import type { Sale, SaleItem, PaymentMethod } from "@/lib/types"

const READ_ONLY_VIEW = "report"

export default function RelatoriosPage() {
  const searchParams = useSearchParams()
  const readOnly =
    searchParams.get("view") === READ_ONLY_VIEW ||
    process.env.NEXT_PUBLIC_READ_ONLY === "true"

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })
  const [sales, setSales] = useState<Sale[]>([])
  const [expandedSale, setExpandedSale] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<SaleItem[]>([])
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [apiSummary, setApiSummary] = useState<{ date: string; totalCents: number; salesCount: number; itemsCount: number }[]>([])
  const [apiSales, setApiSales] = useState<Sale[]>([])
  const [apiSalesFull, setApiSalesFull] = useState<{ id: string; items: SaleItem[] }[]>([])
  const [apiTopProducts, setApiTopProducts] = useState<{ productId: string; productName: string; totalQty: number; totalCents: number }[]>([])
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const startISO = useMemo(
    () => startOfDay(dateRange.from).toISOString(),
    [dateRange.from]
  )
  const endISO = useMemo(
    () => endOfDay(dateRange.to).toISOString(),
    [dateRange.to]
  )

  const loadData = useCallback(() => {
    setSales(getSales(startISO, endISO))
  }, [startISO, endISO])

  useEffect(() => {
    if (!readOnly) loadData()
  }, [readOnly, loadData])

  useEffect(() => {
    if (!readOnly) return
    setApiLoading(true)
    setApiError(null)
    Promise.all([
      getReportSummary(startISO, endISO),
      getReportSales(startISO, endISO),
      getReportTopProducts(startISO, endISO, 5),
    ])
      .then(([summary, salesRes, top]) => {
        setApiSummary(summary)
        setApiSales(
          salesRes.map((s) => ({
            id: s.id,
            createdAt: s.createdAt,
            totalCents: s.totalCents,
            itemsCount: s.itemsCount,
            customerName: s.customerName,
            customerPhone: s.customerPhone,
            payments: s.payments,
          }))
        )
        setApiSalesFull(salesRes.map((s) => ({ id: s.id, items: s.items })))
        setApiTopProducts(top)
      })
      .catch((e) => setApiError(e instanceof Error ? e.message : String(e)))
      .finally(() => setApiLoading(false))
  }, [readOnly, startISO, endISO])

  const dailySummaryLocal = useMemo(
    () => getDailySummary(startISO, endISO),
    [startISO, endISO]
  )
  const topProductsLocal = useMemo(
    () => getTopProducts(startISO, endISO, 5),
    [startISO, endISO]
  )
  const dailySummary = readOnly ? apiSummary : dailySummaryLocal
  const topProducts = readOnly ? apiTopProducts : topProductsLocal
  const salesData = readOnly ? apiSales : sales

  const totalRevenue = useMemo(
    () => salesData.reduce((sum, s) => sum + s.totalCents, 0),
    [salesData]
  )

  const totalItems = useMemo(
    () => salesData.reduce((sum, s) => sum + s.itemsCount, 0),
    [salesData]
  )

  const avgTicket = useMemo(
    () => (salesData.length > 0 ? Math.round(totalRevenue / salesData.length) : 0),
    [totalRevenue, salesData.length]
  )

  const chartData = useMemo(
    () =>
      dailySummary.map((d) => ({
        date: formatDateLabel(d.date),
        total: d.totalCents / 100,
      })),
    [dailySummary]
  )

  function toggleSaleExpand(saleId: string) {
    if (expandedSale === saleId) {
      setExpandedSale(null)
      setExpandedItems([])
    } else {
      setExpandedSale(saleId)
      if (readOnly) {
        const full = apiSalesFull.find((s) => s.id === saleId)
        setExpandedItems(full?.items ?? [])
      } else {
        setExpandedItems(getSaleItems(saleId))
      }
    }
  }

  function handleDateSelect(range: { from?: Date; to?: Date } | undefined) {
    if (range?.from && range?.to) {
      setDateRange({ from: range.from, to: range.to })
      setCalendarOpen(false)
    } else if (range?.from) {
      setDateRange((prev) => ({ ...prev, from: range.from! }))
    }
  }

  function paymentMethodLabel(method: string): string {
    return PAYMENT_METHOD_LABELS[method as PaymentMethod] || method
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header + Date Range */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Relatorios
          </h1>
          <p className="text-sm text-muted-foreground">
            Visao geral das vendas e desempenho
            {readOnly && " (somente leitura)"}
          </p>
        </div>
        {readOnly && apiError && (
          <p className="text-sm text-destructive">{apiError}</p>
        )}
        {readOnly && apiLoading && (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        )}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 w-fit">
              <CalendarIcon className="size-4" />
              <span className="text-sm">
                {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} -{" "}
                {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
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

      {/* Summary Cards */}
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

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily revenue chart */}
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
                    tickFormatter={(v) => `R$${v}`}
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

        {/* Top products */}
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
                {topProducts.map((tp, index) => (
                  <div
                    key={tp.productId}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-bold text-muted-foreground w-5 text-right shrink-0">
                        {index + 1}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {tp.productName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tp.totalQty} vendido(s)
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground shrink-0 ml-3">
                      {formatCurrency(tp.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales List */}
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
                        className="cursor-pointer hover:bg-accent/50"
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
                              sale.payments.map((p, i) => (
                                <Badge key={i} variant="outline" className="text-xs gap-1">
                                  <CreditCard className="size-3" />
                                  {paymentMethodLabel(p.method)}
                                  {sale.payments.length > 1 && (
                                    <span className="text-muted-foreground">
                                      {formatCurrency(p.amountCents)}
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
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                                Itens da venda
                              </p>
                              <div className="flex flex-col gap-1">
                                {expandedItems.map((item) => (
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
    </div>
  )
}
