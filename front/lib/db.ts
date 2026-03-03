import type {
  Product,
  Sale,
  SaleItem,
  CartItem,
  DailySummary,
  TopProduct,
  PaymentSplit,
  StockLog,
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

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
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
