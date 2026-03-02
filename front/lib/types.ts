export type ProductCategory =
  | "roupas"
  | "tenis"
  | "controles"
  | "eletronicos"
  | "diversos"

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  roupas: "Roupas",
  tenis: "Tenis",
  controles: "Controles",
  eletronicos: "Eletronicos",
  diversos: "Diversos",
}

export interface Product {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
  priceCents: number
  costCents: number | null
  category: ProductCategory
  imageUrl: string | null
  brand: string | null
  model: string | null
  size: string | null
  color: string | null
  description: string | null
  controlNumber: string | null
  createdAt: string
  updatedAt: string
}

// --------------- Payment ---------------

export type PaymentMethod = "dinheiro" | "credito" | "debito" | "fiado"

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  credito: "Credito",
  debito: "Debito",
  fiado: "Fiado",
}

export interface PaymentSplit {
  method: PaymentMethod
  amountCents: number
}

// --------------- Sale ---------------

export interface Sale {
  id: string
  createdAt: string
  totalCents: number
  itemsCount: number
  payments: PaymentSplit[]
  customerName: string | null
  customerPhone: string | null
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  productName: string
  sku: string | null
  qty: number
  unitPriceCents: number
  lineTotalCents: number
}

export interface CartItem {
  product: Product
  qty: number
}

// --------------- Stock Log ---------------

export interface StockLog {
  id: string
  productId: string
  productName: string
  delta: number
  reason: string | null
  createdAt: string
}

// --------------- Reports ---------------

export interface DailySummary {
  date: string
  totalCents: number
  salesCount: number
  itemsCount: number
}

export interface TopProduct {
  productId: string
  productName: string
  totalQty: number
  totalCents: number
}
