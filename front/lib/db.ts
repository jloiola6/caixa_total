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

const PRODUCTS_KEY = "caixatotal_products"
const SALES_KEY = "caixatotal_sales"
const SALE_ITEMS_KEY = "caixatotal_sale_items"
const STOCK_LOGS_KEY = "caixatotal_stock_logs"

// --------------- Products ---------------

export function getProducts(query?: string): Product[] {
  migrateProducts()
  const products = read<Product>(PRODUCTS_KEY)
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
  return read<Product>(PRODUCTS_KEY).find((p) => p.id === id)
}

export function getProductByBarcode(barcode: string): Product | undefined {
  return read<Product>(PRODUCTS_KEY).find(
    (p) => p.barcode && p.barcode === barcode
  )
}

export function upsertProduct(product: Partial<Product> & { name: string; priceCents: number; category: Product["category"] }): Product {
  const products = read<Product>(PRODUCTS_KEY)
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
    write(PRODUCTS_KEY, products)
    return updated
  }

  const newProduct: Product = {
    id: crypto.randomUUID(),
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
  write(PRODUCTS_KEY, products)
  return newProduct
}

export function deleteProduct(id: string): boolean {
  const products = read<Product>(PRODUCTS_KEY)
  const filtered = products.filter((p) => p.id !== id)
  if (filtered.length === products.length) return false
  write(PRODUCTS_KEY, filtered)
  return true
}

export function adjustStock(productId: string, delta: number, reason?: string | null): Product | null {
  const products = read<Product>(PRODUCTS_KEY)
  const idx = products.findIndex((p) => p.id === productId)
  if (idx === -1) return null

  const newStock = products[idx].stock + delta
  if (newStock < 0) return null

  products[idx] = {
    ...products[idx],
    stock: newStock,
    updatedAt: new Date().toISOString(),
  }
  write(PRODUCTS_KEY, products)

  // Save stock log
  const log: StockLog = {
    id: crypto.randomUUID(),
    productId,
    productName: products[idx].name,
    delta,
    reason: reason?.trim() || null,
    createdAt: new Date().toISOString(),
  }
  const logs = read<StockLog>(STOCK_LOGS_KEY)
  logs.push(log)
  write(STOCK_LOGS_KEY, logs)

  return products[idx]
}

export function getStockLogs(productId?: string): StockLog[] {
  let logs = read<StockLog>(STOCK_LOGS_KEY)
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

  const products = read<Product>(PRODUCTS_KEY)

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
  write(PRODUCTS_KEY, products)

  const saleId = crypto.randomUUID()
  const now = new Date().toISOString()

  const saleItems: SaleItem[] = items.map((item) => ({
    id: crypto.randomUUID(),
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

  const allSales = read<Sale>(SALES_KEY)
  allSales.push(sale)
  write(SALES_KEY, allSales)

  const allSaleItems = read<SaleItem>(SALE_ITEMS_KEY)
  allSaleItems.push(...saleItems)
  write(SALE_ITEMS_KEY, allSaleItems)

  return { sale, saleItems }
}

export function getSales(startDate?: string, endDate?: string): Sale[] {
  let sales = read<Sale>(SALES_KEY)

  if (startDate) {
    sales = sales.filter((s) => s.createdAt >= startDate)
  }
  if (endDate) {
    sales = sales.filter((s) => s.createdAt <= endDate)
  }

  return sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getSaleItems(saleId: string): SaleItem[] {
  return read<SaleItem>(SALE_ITEMS_KEY).filter((si) => si.saleId === saleId)
}

// --------------- Reports ---------------

export function getTopProducts(
  startDate?: string,
  endDate?: string,
  limit = 10
): TopProduct[] {
  let saleItems = read<SaleItem>(SALE_ITEMS_KEY)

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
  const products = read<Product>(PRODUCTS_KEY)
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
  if (needsWrite) write(PRODUCTS_KEY, products)
}
