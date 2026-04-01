import type {
  Product,
  Sale,
  SaleItem,
  CartItem,
  DailySummary,
  TopProduct,
  PaymentSplit,
  StockLog,
  AppNotification,
  TennisSize,
} from "./types"

// --------------- helpers ---------------

/** Gera UUID v4; funciona em browser e em SSR (Next/Node onde crypto.randomUUID pode não existir). */
function randomUUID(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

function formatCurrencyCents(cents: number): string {
  return CURRENCY_FORMATTER.format(cents / 100)
}

const TENNIS_VARIANT_SEPARATOR = "::"

function legacyTennisSizeId(productId: string, size: string): string {
  return `legacy_${productId}_${size.replace(/\s+/g, "_")}`
}

function normalizeTennisSizes(
  tennisSizes: Product["tennisSizes"] | undefined,
  nowIso: string
): TennisSize[] | null {
  if (!Array.isArray(tennisSizes)) return null

  const seen = new Set<string>()
  const normalized: TennisSize[] = []
  for (const raw of tennisSizes) {
    const number = (raw?.number ?? "").trim()
    if (!number) continue
    const id = (raw?.id ?? randomUUID()).trim()
    if (!id || seen.has(id)) continue
    seen.add(id)

    normalized.push({
      id,
      number,
      stock: Math.max(0, Number(raw?.stock ?? 0) || 0),
      sku: (raw?.sku ?? "").trim() || null,
      barcode: (raw?.barcode ?? "").trim() || null,
      createdAt: raw?.createdAt ?? nowIso,
      updatedAt: raw?.updatedAt ?? nowIso,
    })
  }

  return normalized
}

function buildSellableTennisVariant(product: Product, tennisSize: TennisSize): Product {
  const baseSku = product.sku ? `${product.sku}-${tennisSize.number}` : null
  return {
    ...product,
    id: `${product.id}${TENNIS_VARIANT_SEPARATOR}${tennisSize.id}`,
    name: `${product.name} (Tam ${tennisSize.number})`,
    sku: tennisSize.sku ?? baseSku,
    barcode: tennisSize.barcode ?? null,
    size: tennisSize.number,
    stock: tennisSize.stock,
    tennisSizes: null,
  }
}

function parseTennisVariantId(id: string): { productId: string; tennisSizeId: string } | null {
  const splitIndex = id.indexOf(TENNIS_VARIANT_SEPARATOR)
  if (splitIndex <= 0) return null
  const productId = id.slice(0, splitIndex)
  const tennisSizeId = id.slice(splitIndex + TENNIS_VARIANT_SEPARATOR.length)
  if (!productId || !tennisSizeId) return null
  return { productId, tennisSizeId }
}

const OFFLINE_DB_NAME = "caixatotal_offline_db"
const OFFLINE_DB_VERSION = 1
const OFFLINE_STORE_NAME = "collections"

const memoryCache = new Map<string, unknown[]>()
const loadedKeys = new Set<string>()
const loadingKeys = new Map<string, Promise<void>>()
const keyVersions = new Map<string, number>()

let dbPromise: Promise<IDBDatabase> | null = null

function cloneArray<T>(data: T[]): T[] {
  try {
    return structuredClone(data)
  } catch {
    return JSON.parse(JSON.stringify(data)) as T[]
  }
}

function safeParseArray<T>(raw: string | null): T[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : null
  } catch {
    return null
  }
}

function readLocalStorageArray<T>(key: string): T[] | null {
  if (typeof window === "undefined") return null
  return safeParseArray<T>(localStorage.getItem(key))
}

function writeLocalStorageBestEffort<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // localStorage pode estourar quota; IndexedDB continua sendo a fonte offline.
  }
}

function bumpVersion(key: string) {
  const current = keyVersions.get(key) ?? 0
  keyVersions.set(key, current + 1)
}

function isRecordWithId(value: unknown): value is { id: string } {
  if (!value || typeof value !== "object") return false
  const maybeId = (value as { id?: unknown }).id
  return typeof maybeId === "string"
}

function mergeById(base: unknown[], current: unknown[]): unknown[] {
  const baseOk = base.every(isRecordWithId)
  const currentOk = current.every(isRecordWithId)
  if (!baseOk || !currentOk) return current

  const map = new Map<string, unknown>()
  for (const item of base) map.set(item.id, item)
  for (const item of current) map.set(item.id, item)
  return Array.from(map.values())
}

function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB indisponivel"))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        db.createObjectStore(OFFLINE_STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB"))
  })

  return dbPromise
}

function readFromIndexedDb<T>(key: string): Promise<T[] | null> {
  return openOfflineDb()
    .then(
      (db) =>
        new Promise<T[] | null>((resolve, reject) => {
          const tx = db.transaction(OFFLINE_STORE_NAME, "readonly")
          const store = tx.objectStore(OFFLINE_STORE_NAME)
          const req = store.get(key)
          req.onsuccess = () => {
            const value = req.result
            resolve(Array.isArray(value) ? (value as T[]) : null)
          }
          req.onerror = () => reject(req.error ?? new Error("Falha ao ler IndexedDB"))
        })
    )
    .catch(() => null)
}

function writeToIndexedDb<T>(key: string, data: T[]): Promise<void> {
  return openOfflineDb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite")
          const store = tx.objectStore(OFFLINE_STORE_NAME)
          const req = store.put(data, key)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error ?? new Error("Falha ao gravar IndexedDB"))
        })
    )
    .catch(() => {})
}

function dispatchDataLoadedEvent() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event("storage"))
}

function ensureLoaded(key: string) {
  if (typeof window === "undefined") return
  if (loadedKeys.has(key) || loadingKeys.has(key)) return

  if (!memoryCache.has(key)) {
    const localData = readLocalStorageArray<unknown>(key)
    memoryCache.set(key, localData ?? [])
  }

  const startVersion = keyVersions.get(key) ?? 0
  const promise = (async () => {
    const indexedData = await readFromIndexedDb<unknown>(key)
    const currentData = memoryCache.get(key) ?? []
    const changedDuringLoad = (keyVersions.get(key) ?? 0) !== startVersion

    if (changedDuringLoad) {
      if (indexedData && indexedData.length > 0) {
        const merged = mergeById(indexedData, currentData)
        memoryCache.set(key, merged)
        writeLocalStorageBestEffort(key, merged)
        await writeToIndexedDb(key, merged)
      } else {
        await writeToIndexedDb(key, currentData)
      }
    } else if (indexedData) {
      memoryCache.set(key, indexedData)
      writeLocalStorageBestEffort(key, indexedData)
    } else {
      await writeToIndexedDb(key, currentData)
    }

    loadedKeys.add(key)
    dispatchDataLoadedEvent()
  })()
    .catch(() => {
      loadedKeys.add(key)
    })
    .finally(() => {
      loadingKeys.delete(key)
    })

  loadingKeys.set(key, promise)
}

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  ensureLoaded(key)
  const data = memoryCache.get(key)
  return cloneArray((data as T[]) ?? [])
}

function write<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return
  const cloned = cloneArray(data)
  memoryCache.set(key, cloned as unknown[])
  loadedKeys.add(key)
  bumpVersion(key)
  writeLocalStorageBestEffort(key, cloned)
  void writeToIndexedDb(key, cloned)
  dispatchDataLoadedEvent()
}

export async function readCollectionAsync<T>(key: string): Promise<T[]> {
  if (typeof window === "undefined") return []
  ensureLoaded(key)
  const loading = loadingKeys.get(key)
  if (loading) await loading
  const data = memoryCache.get(key)
  return cloneArray((data as T[]) ?? [])
}

export async function writeCollectionAsync<T>(key: string, data: T[]): Promise<void> {
  if (typeof window === "undefined") return
  const cloned = cloneArray(data)
  memoryCache.set(key, cloned as unknown[])
  loadedKeys.add(key)
  bumpVersion(key)
  writeLocalStorageBestEffort(key, cloned)
  await writeToIndexedDb(key, cloned)
  dispatchDataLoadedEvent()
}

function getStoreSuffix(): string {
  if (typeof window === "undefined") return ""
  const id = localStorage.getItem("caixatotal_storeId")
  return id ? `_${id}` : ""
}

export function getProductsKey() {
  return `caixatotal_products${getStoreSuffix()}`
}
export function getSalesKey() {
  return `caixatotal_sales${getStoreSuffix()}`
}
export function getSaleItemsKey() {
  return `caixatotal_sale_items${getStoreSuffix()}`
}
export function getStockLogsKey() {
  return `caixatotal_stock_logs${getStoreSuffix()}`
}
export function getNotificationsKey() {
  return `caixatotal_notifications${getStoreSuffix()}`
}

// --------------- Products ---------------

export function getProducts(query?: string): Product[] {
  migrateProducts()
  const products = read<Product>(getProductsKey())
  if (!query || query.trim() === "") return products.sort((a, b) => a.name.localeCompare(b.name))

  const q = query.toLowerCase().trim()
  return products
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.type && p.type.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.model && p.model.toLowerCase().includes(q)) ||
        (p.size && p.size.toLowerCase().includes(q)) ||
        (p.controlNumber && p.controlNumber.toLowerCase().includes(q)) ||
        (p.tennisSizes &&
          p.tennisSizes.some(
            (size) =>
              size.number.toLowerCase().includes(q) ||
              (size.sku && size.sku.toLowerCase().includes(q)) ||
              (size.barcode && size.barcode.toLowerCase().includes(q))
          ))
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getProductById(id: string): Product | undefined {
  return read<Product>(getProductsKey()).find((p) => p.id === id)
}

export function getProductByBarcode(barcode: string): Product | undefined {
  const products = read<Product>(getProductsKey())

  for (const product of products) {
    if (product.barcode && product.barcode === barcode) return product
    if (product.category !== "tenis" || !product.tennisSizes) continue
    const tennisSize = product.tennisSizes.find((size) => size.barcode && size.barcode === barcode)
    if (!tennisSize) continue
    return buildSellableTennisVariant(product, tennisSize)
  }
  return undefined
}

export function getAllBarcodes(): Set<string> {
  const all = new Set<string>()
  for (const product of read<Product>(getProductsKey())) {
    if (product.barcode) all.add(product.barcode)
    if (product.tennisSizes) {
      for (const size of product.tennisSizes) {
        if (size.barcode) all.add(size.barcode)
      }
    }
  }
  return all
}

export function getSellableProducts(query?: string): Product[] {
  const products = getProducts(query)
  const flattened: Product[] = []

  for (const product of products) {
    if (product.category === "tenis" && product.tennisSizes && product.tennisSizes.length > 0) {
      for (const tennisSize of product.tennisSizes) {
        flattened.push(buildSellableTennisVariant(product, tennisSize))
      }
      continue
    }
    flattened.push(product)
  }

  return flattened.sort((a, b) => a.name.localeCompare(b.name))
}

export function getSellableProductByBarcode(barcode: string): Product | undefined {
  const products = getProducts()
  for (const product of products) {
    if (product.category !== "tenis") {
      if (product.barcode && product.barcode === barcode) return product
      continue
    }

    if (product.tennisSizes) {
      const bySizeBarcode = product.tennisSizes.find(
        (size) => size.barcode && size.barcode === barcode
      )
      if (bySizeBarcode) return buildSellableTennisVariant(product, bySizeBarcode)

      if (product.tennisSizes.length === 1 && product.barcode === barcode) {
        return buildSellableTennisVariant(product, product.tennisSizes[0])
      }
    }
  }
  return undefined
}

export function upsertProduct(product: Partial<Product> & { name: string; priceCents: number; category: Product["category"] }): Product {
  const products = read<Product>(getProductsKey())
  const now = new Date().toISOString()

  const existing = product.id ? products.find((p) => p.id === product.id) : null

  if (existing) {
    const updatedBase: Product = {
      ...existing,
      ...product,
      updatedAt: now,
    }
    const normalizedSizes =
      updatedBase.category === "tenis"
        ? normalizeTennisSizes(updatedBase.tennisSizes, now)
        : null
    const updated: Product = {
      ...updatedBase,
      stock:
        updatedBase.category === "tenis"
          ? (normalizedSizes ?? []).reduce((sum, size) => sum + size.stock, 0)
          : updatedBase.stock,
      size: updatedBase.category === "tenis" ? null : updatedBase.size ?? null,
      tennisSizes: normalizedSizes,
    }
    const idx = products.findIndex((p) => p.id === existing.id)
    products[idx] = updated
    write(getProductsKey(), products)
    return updated
  }

  const normalizedNewSizes =
    product.category === "tenis"
      ? normalizeTennisSizes(product.tennisSizes, now)
      : null

  const newProduct: Product = {
    id: randomUUID(),
    name: product.name,
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
    stock:
      product.category === "tenis"
        ? (normalizedNewSizes ?? []).reduce((sum, size) => sum + size.stock, 0)
        : product.stock ?? 0,
    priceCents: product.priceCents,
    costCents: product.costCents ?? null,
    category: product.category,
    imageUrl: product.imageUrl ?? null,
    type: product.type ?? null,
    brand: product.brand ?? null,
    model: product.model ?? null,
    size: product.category === "tenis" ? null : product.size ?? null,
    color: product.color ?? null,
    description: product.description ?? null,
    controlNumber: product.controlNumber ?? null,
    tennisSizes: normalizedNewSizes,
    createdAt: now,
    updatedAt: now,
  }
  products.push(newProduct)
  write(getProductsKey(), products)
  return newProduct
}

export function deleteProduct(id: string): boolean {
  const products = read<Product>(getProductsKey())
  const filtered = products.filter((p) => p.id !== id)
  if (filtered.length === products.length) return false
  write(getProductsKey(), filtered)
  return true
}

export function adjustStock(
  productId: string,
  delta: number,
  reason?: string | null,
  tennisSizeId?: string | null
): Product | null {
  const products = read<Product>(getProductsKey())
  const idx = products.findIndex((p) => p.id === productId)
  if (idx === -1) return null

  const now = new Date().toISOString()
  const current = products[idx]

  if (current.category === "tenis" && current.tennisSizes) {
    if (!tennisSizeId) return null
    const sizeIdx = current.tennisSizes.findIndex((size) => size.id === tennisSizeId)
    if (sizeIdx === -1) return null

    const size = current.tennisSizes[sizeIdx]
    const newSizeStock = size.stock + delta
    if (newSizeStock < 0) return null

    const nextSizes = current.tennisSizes.map((item, index) =>
      index === sizeIdx ? { ...item, stock: newSizeStock, updatedAt: now } : item
    )
    const nextStock = nextSizes.reduce((sum, item) => sum + item.stock, 0)
    products[idx] = {
      ...current,
      tennisSizes: nextSizes,
      stock: nextStock,
      updatedAt: now,
    }

    write(getProductsKey(), products)

    const log: StockLog = {
      id: randomUUID(),
      productId,
      productName: `${products[idx].name} Tam ${size.number}`,
      delta,
      reason: reason?.trim() || null,
      createdAt: now,
    }
    const logs = read<StockLog>(getStockLogsKey())
    logs.push(log)
    write(getStockLogsKey(), logs)
    return products[idx]
  }

  const newStock = current.stock + delta
  if (newStock < 0) return null

  products[idx] = {
    ...current,
    stock: newStock,
    updatedAt: now,
  }
  write(getProductsKey(), products)

  // Save stock log
  const log: StockLog = {
    id: randomUUID(),
    productId,
    productName: products[idx].name,
    delta,
    reason: reason?.trim() || null,
    createdAt: now,
  }
  const logs = read<StockLog>(getStockLogsKey())
  logs.push(log)
  write(getStockLogsKey(), logs)

  return products[idx]
}

export function getStockLogs(productId?: string): StockLog[] {
  let logs = read<StockLog>(getStockLogsKey())
  if (productId) {
    logs = logs.filter((l) => l.productId === productId)
  }
  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// --------------- Notifications ---------------

function buildSaleNotification(sale: Sale): AppNotification {
  const itemsLabel = sale.itemsCount === 1 ? "1 item" : `${sale.itemsCount} itens`
  return {
    id: randomUUID(),
    type: "sale_created",
    title: "Nova venda registrada",
    message: `${itemsLabel} · Total ${formatCurrencyCents(sale.totalCents)}`,
    saleId: sale.id,
    saleCreatedAt: sale.createdAt,
    createdAt: new Date().toISOString(),
    readAt: null,
  }
}

function appendNotification(notification: AppNotification): AppNotification {
  const key = getNotificationsKey()
  const notifications = read<AppNotification>(key)
  notifications.unshift(notification)
  if (notifications.length > 1000) notifications.length = 1000
  write(key, notifications)
  return notification
}

export function getNotifications(limit?: number): AppNotification[] {
  const notifications = read<AppNotification>(getNotificationsKey())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!limit || limit <= 0) return notifications
  return notifications.slice(0, limit)
}

export function getUnreadNotificationsCount(): number {
  return read<AppNotification>(getNotificationsKey()).filter((n) => !n.readAt).length
}

export function markNotificationAsRead(id: string): boolean {
  const key = getNotificationsKey()
  const notifications = read<AppNotification>(key)
  const idx = notifications.findIndex((n) => n.id === id)
  if (idx === -1) return false
  if (notifications[idx].readAt) return true
  notifications[idx] = {
    ...notifications[idx],
    readAt: new Date().toISOString(),
  }
  write(key, notifications)
  return true
}

export function markAllNotificationsAsRead(): number {
  const key = getNotificationsKey()
  const notifications = read<AppNotification>(key)
  let changed = 0
  const now = new Date().toISOString()
  const next = notifications.map((n) => {
    if (n.readAt) return n
    changed += 1
    return { ...n, readAt: now }
  })
  if (changed > 0) write(key, next)
  return changed
}

// --------------- Sales ---------------

export interface CreateSaleInput {
  items: CartItem[]
  payments: PaymentSplit[]
  customerName?: string | null
  customerPhone?: string | null
  lineTotalOverridesCents?: Record<string, number>
}

export function createSale(
  input: CreateSaleInput
): { sale: Sale; saleItems: SaleItem[] } | null {
  const { items, payments, customerName, customerPhone, lineTotalOverridesCents } = input
  if (items.length === 0) return null

  const products = read<Product>(getProductsKey())

  // Validate stock
  for (const item of items) {
    const tennisVariant = parseTennisVariantId(item.product.id)
    if (tennisVariant) {
      const parent = products.find((pr) => pr.id === tennisVariant.productId)
      if (!parent || parent.category !== "tenis" || !parent.tennisSizes) return null
      const size = parent.tennisSizes.find((ts) => ts.id === tennisVariant.tennisSizeId)
      if (!size || size.stock < item.qty) return null
      continue
    }

    const p = products.find((pr) => pr.id === item.product.id)
    if (!p || p.stock < item.qty) return null
  }

  // Deduct stock
  for (const item of items) {
    const now = new Date().toISOString()
    const tennisVariant = parseTennisVariantId(item.product.id)
    if (tennisVariant) {
      const parentIdx = products.findIndex((pr) => pr.id === tennisVariant.productId)
      if (parentIdx === -1) return null
      const parent = products[parentIdx]
      if (parent.category !== "tenis" || !parent.tennisSizes) return null

      const sizeIdx = parent.tennisSizes.findIndex((ts) => ts.id === tennisVariant.tennisSizeId)
      if (sizeIdx === -1) return null
      const size = parent.tennisSizes[sizeIdx]
      if (size.stock < item.qty) return null

      const nextSizes = parent.tennisSizes.map((ts, index) =>
        index === sizeIdx
          ? { ...ts, stock: ts.stock - item.qty, updatedAt: now }
          : ts
      )
      const totalStock = nextSizes.reduce((sum, ts) => sum + ts.stock, 0)

      products[parentIdx] = {
        ...parent,
        tennisSizes: nextSizes,
        stock: totalStock,
        updatedAt: now,
      }
      continue
    }

    const idx = products.findIndex((pr) => pr.id === item.product.id)
    if (idx === -1) return null
    products[idx] = {
      ...products[idx],
      stock: products[idx].stock - item.qty,
      updatedAt: now,
    }
  }
  write(getProductsKey(), products)

  const saleId = randomUUID()
  const now = new Date().toISOString()

  const saleItems: SaleItem[] = items.map((item) => {
    const defaultLineTotal = item.product.priceCents * item.qty
    const overriddenTotal = lineTotalOverridesCents?.[item.product.id]
    const lineTotalCents =
      typeof overriddenTotal === "number" && Number.isFinite(overriddenTotal)
        ? Math.max(0, Math.floor(overriddenTotal))
        : defaultLineTotal

    return {
      id: randomUUID(),
      saleId,
      productId: item.product.id,
      productName: item.product.name,
      sku: item.product.sku,
      qty: item.qty,
      unitPriceCents: item.qty > 0 ? Math.floor(lineTotalCents / item.qty) : item.product.priceCents,
      lineTotalCents,
    }
  })

  const totalCents = saleItems.reduce((sum, si) => sum + si.lineTotalCents, 0)
  const itemsCount = saleItems.reduce((sum, si) => sum + si.qty, 0)

  const sale: Sale = {
    id: saleId,
    createdAt: now,
    totalCents,
    itemsCount,
    payments,
    customerName: customerName?.trim() || null,
    customerPhone: customerPhone?.trim() || null,
  }

  const allSales = read<Sale>(getSalesKey())
  allSales.push(sale)
  write(getSalesKey(), allSales)

  const allSaleItems = read<SaleItem>(getSaleItemsKey())
  allSaleItems.push(...saleItems)
  write(getSaleItemsKey(), allSaleItems)

  appendNotification(buildSaleNotification(sale))

  return { sale, saleItems }
}

export function getSales(startDate?: string, endDate?: string): Sale[] {
  let sales = read<Sale>(getSalesKey())

  if (startDate) {
    sales = sales.filter((s) => s.createdAt >= startDate)
  }
  if (endDate) {
    sales = sales.filter((s) => s.createdAt <= endDate)
  }

  return sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getSaleItems(saleId: string): SaleItem[] {
  return read<SaleItem>(getSaleItemsKey()).filter((si) => si.saleId === saleId)
}

// --------------- Reports ---------------

export function getTopProducts(
  startDate?: string,
  endDate?: string,
  limit = 10
): TopProduct[] {
  let saleItems = read<SaleItem>(getSaleItemsKey())

  if (startDate || endDate) {
    const saleIds = new Set(
      getSales(startDate, endDate).map((s) => s.id)
    )
    saleItems = saleItems.filter((si) => saleIds.has(si.saleId))
  }

  const map = new Map<string, TopProduct>()
  for (const si of saleItems) {
    const existing = map.get(si.productId)
    if (existing) {
      existing.totalQty += si.qty
      existing.totalCents += si.lineTotalCents
    } else {
      map.set(si.productId, {
        productId: si.productId,
        productName: si.productName,
        totalQty: si.qty,
        totalCents: si.lineTotalCents,
      })
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, limit)
}

export function getDailySummary(
  startDate?: string,
  endDate?: string
): DailySummary[] {
  const sales = getSales(startDate, endDate)
  const map = new Map<string, DailySummary>()

  for (const sale of sales) {
    const dateKey = sale.createdAt.slice(0, 10) // YYYY-MM-DD
    const existing = map.get(dateKey)
    if (existing) {
      existing.totalCents += sale.totalCents
      existing.salesCount += 1
      existing.itemsCount += sale.itemsCount
    } else {
      map.set(dateKey, {
        date: dateKey,
        totalCents: sale.totalCents,
        salesCount: 1,
        itemsCount: sale.itemsCount,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
}

// --------------- Migration ---------------

// Migrate old products that may not have the new category fields (no demo seed)
function migrateProducts() {
  const products = read<Product>(getProductsKey())
  let needsWrite = false
  for (let i = 0; i < products.length; i++) {
    const now = new Date().toISOString()
    if (!products[i].category) {
      products[i] = {
        ...products[i],
        category: "diversos",
        imageUrl: products[i].imageUrl ?? null,
        type: products[i].type ?? null,
        brand: products[i].brand ?? null,
        model: products[i].model ?? null,
        size: products[i].size ?? null,
        color: products[i].color ?? null,
        description: products[i].description ?? null,
        controlNumber: products[i].controlNumber ?? null,
        tennisSizes: products[i].tennisSizes ?? null,
      }
      needsWrite = true
    } else if (
      typeof products[i].type === "undefined" ||
      typeof products[i].tennisSizes === "undefined"
    ) {
      products[i] = {
        ...products[i],
        type: products[i].category === "controles" ? products[i].brand ?? null : null,
        tennisSizes: products[i].tennisSizes ?? null,
      }
      needsWrite = true
    }

    if (products[i].category === "tenis") {
      let normalized = normalizeTennisSizes(products[i].tennisSizes, now)
      const currentSize = products[i].size
      if ((!normalized || normalized.length === 0) && currentSize) {
        normalized = [
          {
            id: legacyTennisSizeId(products[i].id, currentSize),
            number: currentSize,
            stock: Math.max(0, products[i].stock),
            sku: products[i].sku ?? null,
            barcode: products[i].barcode ?? null,
            createdAt: now,
            updatedAt: now,
          },
        ]
        needsWrite = true
      } else if ((!normalized || normalized.length === 0) && products[i].stock > 0) {
        const fallbackSize = "U"
        normalized = [
          {
            id: legacyTennisSizeId(products[i].id, fallbackSize),
            number: fallbackSize,
            stock: Math.max(0, products[i].stock),
            sku: products[i].sku ?? null,
            barcode: products[i].barcode ?? null,
            createdAt: now,
            updatedAt: now,
          },
        ]
        needsWrite = true
      }

      const sumStock = (normalized ?? []).reduce((sum, size) => sum + size.stock, 0)
      const normalizedAsJson = JSON.stringify(normalized ?? [])
      const currentAsJson = JSON.stringify(products[i].tennisSizes ?? [])
      if (
        products[i].size !== null ||
        products[i].stock !== sumStock ||
        currentAsJson !== normalizedAsJson
      ) {
        products[i] = {
          ...products[i],
          size: null,
          stock: sumStock,
          tennisSizes: normalized ?? [],
        }
        needsWrite = true
      }
    } else if (products[i].tennisSizes !== null) {
      products[i] = {
        ...products[i],
        tennisSizes: null,
      }
      needsWrite = true
    }
  }
  if (needsWrite) write(getProductsKey(), products)
}
