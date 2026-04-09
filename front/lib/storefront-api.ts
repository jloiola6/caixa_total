import { getApiUrl } from "./api"
import type { ProductCategory } from "./types"

export type StorefrontSize = {
  id: string
  number: string
  stock: number
  sku: string | null
  barcode: string | null
  createdAt: string
  updatedAt: string
}

export type StorefrontProduct = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  stock: number
  priceCents: number
  category: ProductCategory
  imageUrl: string | null
  type: string | null
  brand: string | null
  model: string | null
  size: string | null
  color: string | null
  description: string | null
  controlNumber: string | null
  tennisSizes: StorefrontSize[]
  clothingSizes: StorefrontSize[]
  createdAt: string
  updatedAt: string
}

export type StorefrontResponse = {
  store: {
    id: string
    name: string
    slug: string
    onlineStoreWhatsappNumber: string | null
    onlineStoreWhatsappMessage: string | null
    stockAlertLowColor: string
    stockAlertOutColor: string
    stockAlertOkColor: string
    stockAlertLowThreshold: number
    stockAlertAvailableThreshold: number
  }
  products: StorefrontProduct[]
  generatedAt: string
}

export async function getStorefrontBySlug(slug: string): Promise<StorefrontResponse> {
  const normalizedSlug = slug.trim().toLowerCase()
  if (!normalizedSlug) {
    throw new Error("Slug da loja inválido")
  }

  const res = await fetch(
    getApiUrl(`/storefront/${encodeURIComponent(normalizedSlug)}/products`),
    { cache: "no-store" }
  )

  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) {
    throw new Error(data?.error ?? "Falha ao carregar vitrine da loja")
  }
  return data as StorefrontResponse
}
