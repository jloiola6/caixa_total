import type { ServerSyncState } from "./api"
import { getProductsKey, getSalesKey, getSaleItemsKey, getStockLogsKey } from "./db"

function readLocal<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

export type ConflictItem = {
  entity: "products" | "sales" | "sale_items" | "sale_payments" | "stock_logs"
  id: string
  label: string
  localUpdated: string
  serverUpdated: string
  localPreview: string
  serverPreview: string
}

function getProductLabel(p: { name?: string; id: string }) {
  return (p as { name?: string }).name ?? (p as { id: string }).id
}
function getSaleLabel(s: { id: string; totalCents?: number; createdAt?: string }) {
  const created = (s as { createdAt?: string }).createdAt
  const total = (s as { totalCents?: number }).totalCents
  return created
    ? `${created.slice(0, 10)} - R$ ${total != null ? (total / 100).toFixed(2) : "?"}`
    : (s as { id: string }).id
}

export function computeConflicts(server: ServerSyncState): ConflictItem[] {
  const conflicts: ConflictItem[] = []
  const localProducts = readLocal<{ id: string; updatedAt: string; name?: string }>(getProductsKey())
  const localSales = readLocal<{ id: string; createdAt: string; totalCents?: number }>(getSalesKey())
  const localSaleItems = readLocal<{ id: string; saleId: string }>(getSaleItemsKey())
  const localStockLogs = readLocal<{ id: string; createdAt: string; productName?: string }>(getStockLogsKey())

  const serverProductsById = new Map(server.products.map((p) => [p.id, p]))
  const serverSalesById = new Map(server.sales.map((s) => [s.id, s]))
  const serverSaleItemsById = new Map(server.sale_items.map((s) => [s.id, s]))
  const serverPaymentsById = new Map(server.sale_payments.map((p) => [p.id, p]))
  const serverStockLogsById = new Map(server.stock_logs.map((l) => [l.id, l]))

  for (const local of localProducts) {
    const serverItem = serverProductsById.get(local.id)
    if (!serverItem) continue
    const serverUpdated = (serverItem as { updatedAt?: string }).updatedAt ?? ""
    if ((local.updatedAt ?? "") !== serverUpdated) {
      conflicts.push({
        entity: "products",
        id: local.id,
        label: getProductLabel(local),
        localUpdated: local.updatedAt ?? "",
        serverUpdated,
        localPreview: `${local.name ?? local.id} (estoque: ${(local as { stock?: number }).stock ?? "?"})`,
        serverPreview: `${(serverItem as { name?: string }).name ?? serverItem.id} (estoque: ${(serverItem as { stock?: number }).stock ?? "?"})`,
      })
    }
  }

  for (const local of localSales) {
    const serverItem = serverSalesById.get(local.id)
    if (!serverItem) continue
    const serverCreated = (serverItem as { createdAt?: string }).createdAt ?? ""
    if ((local.createdAt ?? "") !== serverCreated) {
      conflicts.push({
        entity: "sales",
        id: local.id,
        label: getSaleLabel(local),
        localUpdated: local.createdAt ?? "",
        serverUpdated: serverCreated,
        localPreview: getSaleLabel(local),
        serverPreview: getSaleLabel(serverItem as { id: string; createdAt?: string; totalCents?: number }),
      })
    }
  }

  for (const local of localSaleItems) {
    const serverItem = serverSaleItemsById.get(local.id)
    if (!serverItem) continue
    const serverItemObj = serverItem as { saleId?: string; productName?: string; qty?: number }
    const localStr = JSON.stringify({ saleId: local.saleId, productName: (local as { productName?: string }).productName, qty: (local as { qty?: number }).qty })
    const serverStr = JSON.stringify({ saleId: serverItemObj.saleId, productName: serverItemObj.productName, qty: serverItemObj.qty })
    if (localStr !== serverStr) {
      conflicts.push({
        entity: "sale_items",
        id: local.id,
        label: (local as { productName?: string }).productName ?? local.id,
        localUpdated: (local as { updatedAt?: string }).updatedAt ?? "",
        serverUpdated: (serverItem as { updatedAt?: string }).updatedAt ?? "",
        localPreview: localStr.slice(0, 60) + (localStr.length > 60 ? "..." : ""),
        serverPreview: serverStr.slice(0, 60) + (serverStr.length > 60 ? "..." : ""),
      })
    }
  }

  for (const local of localStockLogs) {
    const serverItem = serverStockLogsById.get(local.id)
    if (!serverItem) continue
    const serverCreated = (serverItem as { createdAt?: string }).createdAt ?? ""
    if ((local.createdAt ?? "") !== serverCreated) {
      conflicts.push({
        entity: "stock_logs",
        id: local.id,
        label: (local as { productName?: string }).productName ?? local.id,
        localUpdated: local.createdAt ?? "",
        serverUpdated: serverCreated,
        localPreview: `${(local as { delta?: number }).delta ?? "?"} - ${local.createdAt?.slice(0, 16) ?? ""}`,
        serverPreview: `${(serverItem as { delta?: number }).delta ?? "?"} - ${serverCreated.slice(0, 16)}`,
      })
    }
  }

  return conflicts
}

export function applyServerState(server: ServerSyncState): void {
  const salesWithPayments = server.sales.map((s) => {
    const payments = server.sale_payments.filter((p: { saleId?: string }) => p.saleId === (s as { id: string }).id)
    return {
      ...s,
      payments: payments.map((p: { method: string; amountCents: number }) => ({ method: p.method, amountCents: p.amountCents })),
    }
  })
  if (typeof window === "undefined") return
  localStorage.setItem(getProductsKey(), JSON.stringify(server.products))
  localStorage.setItem(getSalesKey(), JSON.stringify(salesWithPayments))
  localStorage.setItem(getSaleItemsKey(), JSON.stringify(server.sale_items))
  localStorage.setItem(getStockLogsKey(), JSON.stringify(server.stock_logs))
}
