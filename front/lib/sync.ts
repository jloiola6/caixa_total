import { postSync } from "./api"

const PRODUCTS_KEY = "caixatotal_products"
const SALES_KEY = "caixatotal_sales"
const SALE_ITEMS_KEY = "caixatotal_sale_items"
const STOCK_LOGS_KEY = "caixatotal_stock_logs"

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
    const products = read<unknown>(PRODUCTS_KEY)
    const sales = read<unknown>(SALES_KEY)
    const saleItems = read<unknown>(SALE_ITEMS_KEY)
    const stockLogs = read<unknown>(STOCK_LOGS_KEY)
    await postSync({
      products,
      sales,
      sale_items: saleItems,
      stock_logs: stockLogs,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
