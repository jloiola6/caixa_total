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
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.model && p.model.toLowerCase().includes(q)) ||
        (p.controlNumber && p.controlNumber.toLowerCase().includes(q))
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getProductById(id: string): Product | undefined {
  return read<Product>(getProductsKey()).find((p) => p.id === id)
}

export function getProductByBarcode(barcode: string): Product | undefined {
  return read<Product>(getProductsKey()).find(
    (p) => p.barcode && p.barcode === barcode
  )
}

export function getAllBarcodes(): Set<string> {
  return new Set(
    read<Product>(getProductsKey())
      .map((p) => p.barcode)
      .filter((b): b is string => b !== null && b !== "")
  )
}

export function upsertProduct(product: Partial<Product> & { name: string; priceCents: number; category: Product["category"] }): Product {
  const products = read<Product>(getProductsKey())
  const now = new Date().toISOString()

  const existing = product.id ? products.find((p) => p.id === product.id) : null

  if (existing) {
    const updated: Product = {
      ...existing,
      ...product,
      updatedAt: now,
    }
    const idx = products.findIndex((p) => p.id === existing.id)
    products[idx] = updated
    write(getProductsKey(), products)
    return updated
  }

  const newProduct: Product = {
    id: randomUUID(),
    name: product.name,
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
    stock: product.stock ?? 0,
    priceCents: product.priceCents,
    costCents: product.costCents ?? null,
    category: product.category,
    imageUrl: product.imageUrl ?? null,
    brand: product.brand ?? null,
    model: product.model ?? null,
    size: product.size ?? null,
    color: product.color ?? null,
    description: product.description ?? null,
    controlNumber: product.controlNumber ?? null,
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

export function adjustStock(productId: string, delta: number, reason?: string | null): Product | null {
  const products = read<Product>(getProductsKey())
  const idx = products.findIndex((p) => p.id === productId)
  if (idx === -1) return null

  const newStock = products[idx].stock + delta
  if (newStock < 0) return null

  products[idx] = {
    ...products[idx],
    stock: newStock,
    updatedAt: new Date().toISOString(),
  }
  write(getProductsKey(), products)

  // Save stock log
  const log: StockLog = {
    id: randomUUID(),
    productId,
    productName: products[idx].name,
    delta,
    reason: reason?.trim() || null,
    createdAt: new Date().toISOString(),
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
}

export function createSale(
  input: CreateSaleInput
): { sale: Sale; saleItems: SaleItem[] } | null {
  const { items, payments, customerName, customerPhone } = input
  if (items.length === 0) return null

  const products = read<Product>(getProductsKey())

  // Validate stock
  for (const item of items) {
    const p = products.find((pr) => pr.id === item.product.id)
    if (!p || p.stock < item.qty) return null
  }

  // Deduct stock
  for (const item of items) {
    const idx = products.findIndex((pr) => pr.id === item.product.id)
    products[idx] = {
      ...products[idx],
      stock: products[idx].stock - item.qty,
      updatedAt: new Date().toISOString(),
    }
  }
  write(getProductsKey(), products)

  const saleId = randomUUID()
  const now = new Date().toISOString()

  const saleItems: SaleItem[] = items.map((item) => ({
    id: randomUUID(),
    saleId,
    productId: item.product.id,
    productName: item.product.name,
    sku: item.product.sku,
    qty: item.qty,
    unitPriceCents: item.product.priceCents,
    lineTotalCents: item.product.priceCents * item.qty,
  }))

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
    if (!products[i].category) {
      products[i] = {
        ...products[i],
        category: "diversos",
        imageUrl: products[i].imageUrl ?? null,
        brand: products[i].brand ?? null,
        model: products[i].model ?? null,
        size: products[i].size ?? null,
        color: products[i].color ?? null,
        description: products[i].description ?? null,
        controlNumber: products[i].controlNumber ?? null,
      }
      needsWrite = true
    }
  }
  if (needsWrite) write(getProductsKey(), products)
}
