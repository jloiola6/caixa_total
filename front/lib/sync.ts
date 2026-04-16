import { isTransientFetchError, postSync } from "./api"
import {
  getProductsKey,
  getSalesKey,
  getSaleItemsKey,
  getStockLogsKey,
  readCollectionAsync,
} from "./db"
import { getStoredStoreId } from "./auth-api"
import { isOnlineOnlyModeForCurrentStore } from "./offline-mode"
import type { Product, StockLog } from "./types"

type SyncResult = { ok: boolean; error?: string }

type SyncPayload = {
  products?: Product[]
  sales?: unknown[]
  sale_items?: unknown[]
  stock_logs?: StockLog[]
}

async function postSyncPayload(payload: SyncPayload): Promise<SyncResult> {
  try {
    const storeId = getStoredStoreId()
    await postSync(
      {
        products: payload.products ?? [],
        sales: payload.sales ?? [],
        sale_items: payload.sale_items ?? [],
        stock_logs: payload.stock_logs ?? [],
      },
      storeId ?? undefined
    )
    return { ok: true }
  } catch (e) {
    const baseError = e instanceof Error ? e.message : String(e)
    if (
      typeof window !== "undefined" &&
      isOnlineOnlyModeForCurrentStore() &&
      isTransientFetchError(e)
    ) {
      return {
        ok: false,
        error: `Modo offline desabilitado para esta loja. Nao foi possivel sincronizar com a API. (${baseError})`,
      }
    }
    return { ok: false, error: baseError }
  }
}

export async function syncToServer(): Promise<SyncResult> {
  const [products, sales, saleItems, stockLogs] = await Promise.all([
    readCollectionAsync<Product>(getProductsKey()),
    readCollectionAsync<unknown>(getSalesKey()),
    readCollectionAsync<unknown>(getSaleItemsKey()),
    readCollectionAsync<StockLog>(getStockLogsKey()),
  ])

  return postSyncPayload({
    products,
    sales,
    sale_items: saleItems,
    stock_logs: stockLogs,
  })
}

export async function syncProductsAfterMutation(products: Product[]): Promise<SyncResult> {
  if (!isOnlineOnlyModeForCurrentStore()) {
    return syncToServer()
  }

  return postSyncPayload({ products })
}

export async function syncProductStockAfterMutation(
  product: Product,
  stockLog: StockLog
): Promise<SyncResult> {
  if (!isOnlineOnlyModeForCurrentStore()) {
    return syncToServer()
  }

  return postSyncPayload({
    products: [product],
    stock_logs: [stockLog],
  })
}
