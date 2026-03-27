"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Plus, Search, Pencil, PackageMinus, Trash2, Filter, Percent, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ProductFiltersDialog,
  countActiveProductFilters,
  type ProductFilters,
  type ProductFilterOptions,
} from "@/components/product-filters-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProductFormDialog } from "@/components/product-form-dialog"
import { StockAdjustDialog } from "@/components/stock-adjust-dialog"
import { BulkPriceDialog } from "@/components/bulk-price-dialog"
import { ProductExportDialog } from "@/components/product-export-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { getProducts, deleteProduct, getProductById } from "@/lib/db"
import { syncToServer } from "@/lib/sync"
import { formatCurrency } from "@/lib/format"
import type { Product, ProductCategory } from "@/lib/types"
import { PRODUCT_CATEGORY_LABELS } from "@/lib/types"
import { toast } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"

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

function buildProductFilterOptions(products: Product[]): ProductFilterOptions {
  const categories = Array.from(new Set(products.map((p) => p.category))).sort((a, b) => {
    const labelA = PRODUCT_CATEGORY_LABELS[a] ?? a
    const labelB = PRODUCT_CATEGORY_LABELS[b] ?? b
    return labelA.localeCompare(labelB, "pt-BR", { sensitivity: "base" })
  })

  return {
    categories,
    brands: uniqueFilterValues(products.map((p) => p.brand)),
    models: uniqueFilterValues(products.map((p) => p.model)),
    sizes: uniqueFilterValues(products.map((p) => p.size)),
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

function matchesProductFilters(product: Product, filters: ProductFilters): boolean {
  if (filters.categories.length > 0 && !filters.categories.includes(product.category)) {
    return false
  }
  if (!matchesTextFilter(filters.brands, product.brand)) return false
  if (!matchesTextFilter(filters.models, product.model)) return false
  if (!matchesTextFilter(filters.sizes, product.size)) return false
  if (!matchesTextFilter(filters.colors, product.color)) return false
  if (!matchesTextFilter(filters.controlNumbers, product.controlNumber)) return false
  return true
}

function ProductImage({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs font-semibold shrink-0">
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={name}
      className="size-10 rounded-md object-cover border border-border shrink-0"
    />
  )
}

function productSubtitle(product: Product): string {
  const parts: string[] = []
  if (product.brand) parts.push(product.brand)
  if (product.model) parts.push(product.model)
  if (product.size) parts.push(`Tam: ${product.size}`)
  if (product.color) parts.push(product.color)
  if (product.controlNumber) parts.push(`#${product.controlNumber}`)
  return parts.join(" | ")
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [productFilters, setProductFilters] = useState<ProductFilters>(() =>
    createEmptyProductFilters()
  )
  const [filterOptions, setFilterOptions] = useState<ProductFilterOptions>(() =>
    createEmptyProductFilters()
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const isMobile = useIsMobile()

  const selectedProducts = useMemo(() => {
    return Array.from(selectedIds)
      .map((id) => getProductById(id))
      .filter((p): p is Product => p !== undefined)
  }, [selectedIds])

  const activeFiltersCount = useMemo(() => {
    return countActiveProductFilters(productFilters)
  }, [productFilters])

  const allVisibleSelected =
    products.length > 0 && products.every((p) => selectedIds.has(p.id))
  const someVisibleSelected = products.some((p) => selectedIds.has(p.id))

  function toggleSelectId(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAllVisible(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const p of products) next.add(p.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const p of products) next.delete(p.id)
        return next
      })
    }
  }

  const loadProducts = useCallback(() => {
    const allProducts = getProducts()
    setFilterOptions(buildProductFilterOptions(allProducts))

    let prods = query.trim() ? getProducts(query) : allProducts
    prods = prods.filter((p) => matchesProductFilters(p, productFilters))
    setProducts(prods)
  }, [query, productFilters])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // Recarrega lista quando a sincronização atualiza o localStorage (priorizar servidor)
  useEffect(() => {
    const onStorage = () => loadProducts()
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [loadProducts])

  function handleEdit(product: Product) {
    setEditingProduct(product)
    setFormOpen(true)
  }

  function handleNew() {
    setEditingProduct(null)
    setFormOpen(true)
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteProduct(deleteTarget.id)
    toast.success("Produto excluido")
    setDeleteTarget(null)
    loadProducts()
    syncToServer().catch(() => {})
  }

  function stockBadge(stock: number) {
    if (stock === 0)
      return <Badge variant="destructive">Sem estoque</Badge>
    if (stock <= 5)
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          {stock}
        </Badge>
      )
    return <Badge variant="secondary">{stock}</Badge>
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Produtos
          </h1>
          <p className="text-sm text-muted-foreground">
            {products.length} produto(s) encontrado(s)
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={selectedProducts.length === 0}
            onClick={() => setBulkPriceOpen(true)}
          >
            Preço em massa
            {selectedProducts.length > 0 ? ` (${selectedProducts.length})` : ""}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-4" />
            Exportar
          </Button>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="size-4" />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU, marca..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="size-4" />
            Filtros
            {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ""}
          </Button>
          {activeFiltersCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setProductFilters(createEmptyProductFilters())}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Desktop: Table */}
      {!isMobile ? (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2">
                  <Checkbox
                    checked={
                      allVisibleSelected
                        ? true
                        : someVisibleSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                    aria-label="Selecionar todos da lista"
                  />
                </TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Preco</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhum produto encontrado
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => {
                  const subtitle = productSubtitle(product)
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="w-10 px-2">
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={(v) =>
                            toggleSelectId(product.id, v === true)
                          }
                          aria-label={`Selecionar ${product.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <ProductImage src={product.imageUrl} name={product.name} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {product.name}
                          </span>
                          {subtitle && (
                            <span className="text-xs text-muted-foreground">
                              {subtitle}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={CATEGORY_COLORS[product.category] || ""}
                        >
                          {PRODUCT_CATEGORY_LABELS[product.category] || product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.sku || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.priceCents)}
                      </TableCell>
                      <TableCell className="text-center">
                        {stockBadge(product.stock)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => handleEdit(product)}
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setStockProduct(product)}
                            title="Ajustar estoque"
                          >
                            <PackageMinus className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(product)}
                            title="Excluir"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Mobile: Cards */
        <div className="flex flex-col gap-3">
          {products.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum produto encontrado
            </p>
          ) : (
            products.map((product) => {
              const subtitle = productSubtitle(product)
              return (
                <Card key={product.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-2"
                        checked={selectedIds.has(product.id)}
                        onCheckedChange={(v) =>
                          toggleSelectId(product.id, v === true)
                        }
                        aria-label={`Selecionar ${product.name}`}
                      />
                      <ProductImage src={product.imageUrl} name={product.name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground truncate">
                            {product.name}
                          </p>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[product.category] || ""}`}
                          >
                            {PRODUCT_CATEGORY_LABELS[product.category]}
                          </Badge>
                        </div>
                        {subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {subtitle}
                          </p>
                        )}
                        {product.sku && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            SKU: {product.sku}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-sm font-semibold text-foreground">
                            {formatCurrency(product.priceCents)}
                          </span>
                          {stockBadge(product.stock)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => setStockProduct(product)}
                        >
                          <PackageMinus className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(product)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* Dialogs */}
      <ProductFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={productFilters}
        options={filterOptions}
        onApply={setProductFilters}
      />

      <ProductExportDialog open={exportOpen} onOpenChange={setExportOpen} />

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editingProduct}
        onSaved={loadProducts}
      />

      <StockAdjustDialog
        open={!!stockProduct}
        onOpenChange={(open) => !open && setStockProduct(null)}
        product={stockProduct}
        onAdjusted={loadProducts}
      />

      <BulkPriceDialog
        open={bulkPriceOpen}
        onOpenChange={setBulkPriceOpen}
        products={selectedProducts}
        onApplied={() => {
          loadProducts()
          setSelectedIds(new Set())
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              {"Tem certeza que deseja excluir "}
              <strong>{deleteTarget?.name}</strong>
              {"? Esta acao nao pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
