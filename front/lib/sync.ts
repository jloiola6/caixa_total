import { postSync } from "./api"
import { getProductsKey, getSalesKey, getSaleItemsKey, getStockLogsKey } from "./db"
import { getStoredStoreId } from "./auth-api"

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

export async function syncToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const storeId = getStoredStoreId()
    const products = read<unknown>(getProductsKey())
    const sales = read<unknown>(getSalesKey())
    const saleItems = read<unknown>(getSaleItemsKey())
    const stockLogs = read<unknown>(getStockLogsKey())
    await postSync(
      {
        products,
        sales,
        sale_items: saleItems,
        stock_logs: stockLogs,
      },
      storeId ?? undefined
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
