"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Filter, Search, SlidersHorizontal, Store as StoreIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  ProductFiltersDialog,
  countActiveProductFilters,
  type ProductFilters,
  type ProductFilterOptions,
} from "@/components/product-filters-dialog"
import { formatCurrency } from "@/lib/format"
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/types"
import {
  getStorefrontBySlug,
  type StorefrontProduct,
  type StorefrontResponse,
} from "@/lib/storefront-api"

type StoreSort = "relevance" | "name-asc" | "price-asc" | "price-desc" | "stock-desc"

const CATEGORY_COLORS: Record<ProductCategory, string> = {
  roupas: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  tenis: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  controles: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  eletronicos: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  diversos: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300",
}

function createEmptyProductFilters(): ProductFilters {
  return {
    categories: [],
    brands: [],
    models: [],
    sizes: [],
    colors: [],
    controlNumbers: [],
  }
}

function normalizeFilterValue(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

function uniqueFilterValues(values: Array<string | null | undefined>): string[] {
  const byNormalized = new Map<string, string>()
  for (const raw of values) {
    const trimmed = normalizeFilterValue(raw)
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (!byNormalized.has(key)) {
      byNormalized.set(key, trimmed)
    }
  }
  return Array.from(byNormalized.values()).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  )
}

function buildProductFilterOptions(products: StorefrontProduct[]): ProductFilterOptions {
  const categories = Array.from(new Set(products.map((p) => p.category))).sort((a, b) => {
    const labelA = PRODUCT_CATEGORY_LABELS[a] ?? a
    const labelB = PRODUCT_CATEGORY_LABELS[b] ?? b
    return labelA.localeCompare(labelB, "pt-BR", { sensitivity: "base" })
  })

  return {
    categories,
    brands: uniqueFilterValues(products.map((p) => p.brand)),
    models: uniqueFilterValues(products.map((p) => p.model)),
    sizes: uniqueFilterValues(
      products.flatMap((p) => {
        const values: Array<string | null> = [p.size]
        values.push(...p.tennisSizes.map((size) => size.number))
        values.push(...p.clothingSizes.map((size) => size.number))
        return values
      })
    ),
    colors: uniqueFilterValues(products.map((p) => p.color)),
    controlNumbers: uniqueFilterValues(products.map((p) => p.controlNumber)),
  }
}

function matchesTextFilter(selectedValues: string[], rawValue: string | null): boolean {
  if (selectedValues.length === 0) return true
  const normalized = normalizeFilterValue(rawValue)
  if (!normalized) return false
  return selectedValues.includes(normalized)
}

function getDisplayStock(product: StorefrontProduct): number {
  if (product.tennisSizes.length > 0) {
    return product.tennisSizes.reduce((acc, size) => acc + Math.max(0, size.stock), 0)
  }
  if (product.clothingSizes.length > 0) {
    return product.clothingSizes.reduce((acc, size) => acc + Math.max(0, size.stock), 0)
  }
  return Math.max(0, product.stock)
}

function isInStock(product: StorefrontProduct): boolean {
  return getDisplayStock(product) > 0
}

function buildProductSearchText(product: StorefrontProduct): string {
  const sizeValues = [...product.tennisSizes, ...product.clothingSizes]
    .map((size) => size.number)
    .join(" ")
  return [
    product.name,
    product.sku,
    product.barcode,
    product.type,
    product.brand,
    product.model,
    product.size,
    product.color,
    product.description,
    product.controlNumber,
    sizeValues,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
}

function matchesProductFilters(product: StorefrontProduct, filters: ProductFilters): boolean {
  if (filters.categories.length > 0 && !filters.categories.includes(product.category)) {
    return false
  }
  if (!matchesTextFilter(filters.brands, product.brand)) return false
  if (!matchesTextFilter(filters.models, product.model)) return false
  if (filters.sizes.length > 0) {
    const productSizes = new Set<string>()
    const normalizedSingleSize = normalizeFilterValue(product.size)
    if (normalizedSingleSize) productSizes.add(normalizedSingleSize)
    for (const size of product.tennisSizes) {
      const normalized = normalizeFilterValue(size.number)
      if (normalized) productSizes.add(normalized)
    }
    for (const size of product.clothingSizes) {
      const normalized = normalizeFilterValue(size.number)
      if (normalized) productSizes.add(normalized)
    }
    if (!filters.sizes.some((selectedSize) => productSizes.has(selectedSize))) return false
  }
  if (!matchesTextFilter(filters.colors, product.color)) return false
  if (!matchesTextFilter(filters.controlNumbers, product.controlNumber)) return false
  return true
}

function productSubtitle(product: StorefrontProduct): string {
  const parts: string[] = []
  if (product.type) parts.push(`Tipo: ${product.type}`)
  if (product.brand) parts.push(product.brand)
  if (product.model) parts.push(product.model)
  if (product.color) parts.push(product.color)
  return parts.join(" | ")
}

function stockBadge(stock: number) {
  if (stock === 0) {
    return <Badge variant="destructive">Esgotado</Badge>
  }
  if (stock <= 5) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        Estoque baixo: {stock}
      </Badge>
    )
  }
  return <Badge variant="secondary">Disponivel: {stock}</Badge>
}

function sizeStockSummary(product: StorefrontProduct): string | null {
  const sizes = product.tennisSizes.length > 0 ? product.tennisSizes : product.clothingSizes
  if (sizes.length === 0) return null
  const available = sizes.filter((size) => size.stock > 0)
  const base = available.length > 0 ? available : sizes
  const labels = base
    .slice(0, 5)
    .map((size) => `${size.number} (${size.stock})`)
    .join(", ")
  return labels ? `Tamanhos: ${labels}` : null
}

function truncateText(text: string, max = 110): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}...`
}

function sortProducts(
  products: StorefrontProduct[],
  sortBy: StoreSort,
  normalizedQuery: string
): StorefrontProduct[] {
  const sorted = [...products]
  if (sortBy === "price-asc") {
    sorted.sort((a, b) => a.priceCents - b.priceCents)
    return sorted
  }
  if (sortBy === "price-desc") {
    sorted.sort((a, b) => b.priceCents - a.priceCents)
    return sorted
  }
  if (sortBy === "stock-desc") {
    sorted.sort((a, b) => getDisplayStock(b) - getDisplayStock(a))
    return sorted
  }
  if (sortBy === "name-asc") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
    return sorted
  }

  if (!normalizedQuery) {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
    return sorted
  }

  sorted.sort((a, b) => {
    const aName = a.name.toLocaleLowerCase()
    const bName = b.name.toLocaleLowerCase()
    const aNameStarts = aName.startsWith(normalizedQuery) ? 0 : 1
    const bNameStarts = bName.startsWith(normalizedQuery) ? 0 : 1
    if (aNameStarts !== bNameStarts) return aNameStarts - bNameStarts

    const aIndex = buildProductSearchText(a).indexOf(normalizedQuery)
    const bIndex = buildProductSearchText(b).indexOf(normalizedQuery)
    if (aIndex !== bIndex) return aIndex - bIndex

    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  })

  return sorted
}

function LojaPublicaContent() {
  const searchParams = useSearchParams()
  const slug = (searchParams.get("slug") ?? "").trim().toLowerCase()

  const [storefront, setStorefront] = useState<StorefrontResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [query, setQuery] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [productFilters, setProductFilters] = useState<ProductFilters>(() =>
    createEmptyProductFilters()
  )
  const [sortBy, setSortBy] = useState<StoreSort>("relevance")
  const [inStockOnly, setInStockOnly] = useState(true)

  useEffect(() => {
    if (!slug) {
      setStorefront(null)
      setLoading(false)
      setError("Informe o slug da loja na URL, por exemplo: /loja?slug=minha-loja")
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    getStorefrontBySlug(slug)
      .then((data) => {
        if (!active) return
        setStorefront(data)
      })
      .catch((loadError) => {
        if (!active) return
        setStorefront(null)
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar vitrine")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [slug, reloadTick])

  const products = storefront?.products ?? []

  const filterOptions = useMemo(() => {
    return buildProductFilterOptions(products)
  }, [products])

  const activeFiltersCount = useMemo(() => {
    return countActiveProductFilters(productFilters)
  }, [productFilters])

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    let filtered = products

    if (normalizedQuery) {
      filtered = filtered.filter((product) =>
        buildProductSearchText(product).includes(normalizedQuery)
      )
    }

    filtered = filtered.filter((product) => matchesProductFilters(product, productFilters))

    if (inStockOnly) {
      filtered = filtered.filter((product) => isInStock(product))
    }

    return sortProducts(filtered, sortBy, normalizedQuery)
  }, [products, query, productFilters, inStockOnly, sortBy])

  const totalStock = useMemo(() => {
    return products.reduce((acc, product) => acc + getDisplayStock(product), 0)
  }, [products])

  function clearAllFilters() {
    setQuery("")
    setProductFilters(createEmptyProductFilters())
    setSortBy("relevance")
    setInStockOnly(true)
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Carregando vitrine da loja...</p>
      </div>
    )
  }

  if (error || !storefront) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-2xl items-center justify-center p-4">
        <Card className="w-full">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Loja indisponivel</h1>
              <p className="text-sm text-muted-foreground">
                {error ?? "Nao foi possivel carregar a loja online."}
              </p>
            </div>
            <Button type="button" onClick={() => setReloadTick((prev) => prev + 1)}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-muted/40 via-background to-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <header className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                <StoreIcon className="size-3.5" />
                Loja online publica
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {storefront.store.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Consulte produtos, precos e disponibilidade de estoque sem precisar de login.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{products.length} produtos cadastrados</Badge>
              <Badge variant="secondary">{totalStock} itens em estoque</Badge>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full max-w-xl space-y-2">
              <Label htmlFor="storefront-search">Buscar produtos</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="storefront-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nome, SKU, marca, modelo, cor, descricao..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:justify-end">
              <div className="w-full sm:w-52">
                <Label htmlFor="storefront-sort">Ordenar por</Label>
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as StoreSort)}
                >
                  <SelectTrigger id="storefront-sort" className="mt-2">
                    <SelectValue placeholder="Relevancia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevancia</SelectItem>
                    <SelectItem value="name-asc">Nome (A-Z)</SelectItem>
                    <SelectItem value="price-asc">Menor preco</SelectItem>
                    <SelectItem value="price-desc">Maior preco</SelectItem>
                    <SelectItem value="stock-desc">Maior estoque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="in-stock-only">Somente disponiveis</Label>
                  <p className="text-xs text-muted-foreground">Oculta itens esgotados</p>
                </div>
                <Switch
                  id="in-stock-only"
                  checked={inStockOnly}
                  onCheckedChange={setInStockOnly}
                />
              </div>

              <Button type="button" variant="outline" onClick={() => setFiltersOpen(true)}>
                <Filter className="mr-2 size-4" />
                Filtros
                {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{visibleProducts.length} resultado(s)</Badge>
            {(query.trim() || activeFiltersCount > 0 || sortBy !== "relevance" || !inStockOnly) && (
              <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
                <SlidersHorizontal className="mr-2 size-4" />
                Limpar filtros
              </Button>
            )}
          </div>
        </section>

        <section>
          {visibleProducts.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 p-8 text-center">
                <p className="text-base font-medium">Nenhum produto encontrado</p>
                <p className="text-sm text-muted-foreground">
                  Ajuste os filtros ou a busca para ver mais itens do estoque.
                </p>
                <Button type="button" variant="outline" onClick={clearAllFilters}>
                  Limpar e mostrar tudo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const subtitle = productSubtitle(product)
                const displayStock = getDisplayStock(product)
                const sizeSummary = sizeStockSummary(product)
                return (
                  <Card key={product.id} className="overflow-hidden">
                    <CardContent className="flex h-full flex-col p-0">
                      <div className="relative aspect-[4/3] overflow-hidden border-b border-border bg-muted">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-4xl font-semibold text-muted-foreground">
                            {product.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <Badge
                          variant="secondary"
                          className={`absolute left-3 top-3 ${CATEGORY_COLORS[product.category] || ""}`}
                        >
                          {PRODUCT_CATEGORY_LABELS[product.category]}
                        </Badge>
                        <div className="absolute right-3 top-3">{stockBadge(displayStock)}</div>
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <h2 className="text-base font-semibold text-foreground">{product.name}</h2>
                        {subtitle && (
                          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
                        )}
                        {product.description && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {truncateText(product.description)}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {product.sku && (
                            <Badge variant="outline" className="text-[11px]">
                              SKU: {product.sku}
                            </Badge>
                          )}
                          {sizeSummary && (
                            <Badge variant="outline" className="text-[11px]">
                              {sizeSummary}
                            </Badge>
                          )}
                        </div>

                        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Preco</p>
                            <p className="text-lg font-semibold text-foreground">
                              {formatCurrency(product.priceCents)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Estoque</p>
                            <p className="text-sm font-medium text-foreground">{displayStock}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <ProductFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={productFilters}
        options={filterOptions}
        onApply={setProductFilters}
      />
    </div>
  )
}

export default function LojaPublicaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Carregando vitrine da loja...</p>
        </div>
      }
    >
      <LojaPublicaContent />
    </Suspense>
  )
}
