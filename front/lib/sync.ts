import { postSync } from "./api"
import {
  getProductsKey,
  getSalesKey,
  getSaleItemsKey,
  getStockLogsKey,
  readCollectionAsync,
} from "./db"
import { getStoredStoreId } from "./auth-api"
import { isOnlineOnlyModeForCurrentStore } from "./offline-mode"

export async function syncToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const storeId = getStoredStoreId()
    const [products, sales, saleItems, stockLogs] = await Promise.all([
      readCollectionAsync<unknown>(getProductsKey()),
      readCollectionAsync<unknown>(getSalesKey()),
      readCollectionAsync<unknown>(getSaleItemsKey()),
      readCollectionAsync<unknown>(getStockLogsKey()),
    ])
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
    const baseError = e instanceof Error ? e.message : String(e)
    if (typeof window !== "undefined" && isOnlineOnlyModeForCurrentStore()) {
      return {
        ok: false,
        error: `Modo offline desabilitado para esta loja. Nao foi possivel sincronizar com a API. (${baseError})`,
      }
    }
    return { ok: false, error: baseError }
  }
}
