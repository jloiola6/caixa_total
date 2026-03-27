"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Download } from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getProducts } from "@/lib/db"
import { formatCurrency, formatDate } from "@/lib/format"
import { PRODUCT_CATEGORY_LABELS, type Product, type ProductCategory } from "@/lib/types"
import { toast } from "sonner"

type ProductColumnId =
  | "id"
  | "name"
  | "sku"
  | "barcode"
  | "category"
  | "stock"
  | "price"
  | "cost"
  | "brand"
  | "model"
  | "size"
  | "color"
  | "description"
  | "controlNumber"
  | "imageUrl"
  | "createdAt"
  | "updatedAt"

type ProductExportColumn = {
  id: ProductColumnId
  label: string
  selected: boolean
}

const DEFAULT_COLUMNS: ProductExportColumn[] = [
  { id: "name", label: "Nome", selected: true },
  { id: "sku", label: "SKU", selected: true },
  { id: "barcode", label: "Codigo de Barras", selected: true },
  { id: "category", label: "Categoria", selected: true },
  { id: "stock", label: "Estoque", selected: true },
  { id: "price", label: "Preco de Venda", selected: true },
  { id: "cost", label: "Custo", selected: true },
  { id: "brand", label: "Marca", selected: true },
  { id: "model", label: "Modelo", selected: true },
  { id: "size", label: "Tamanho", selected: true },
  { id: "color", label: "Cor", selected: true },
  { id: "controlNumber", label: "Numeracao do Controle", selected: true },
  { id: "description", label: "Descricao", selected: false },
  { id: "imageUrl", label: "URL da Imagem", selected: false },
  { id: "id", label: "ID", selected: false },
  { id: "createdAt", label: "Criado em", selected: false },
  { id: "updatedAt", label: "Atualizado em", selected: false },
]

function cloneColumns(columns: ProductExportColumn[]): ProductExportColumn[] {
  return columns.map((column) => ({ ...column }))
}

function formatDateSafe(value: string): string {
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

function getColumnValue(product: Product, columnId: ProductColumnId): string {
  switch (columnId) {
    case "id":
      return product.id
    case "name":
      return product.name
    case "sku":
      return product.sku ?? ""
    case "barcode":
      return product.barcode ?? ""
    case "category":
      return PRODUCT_CATEGORY_LABELS[product.category] ?? product.category
    case "stock":
      return String(product.stock)
    case "price":
      return formatCurrency(product.priceCents)
    case "cost":
      return product.costCents == null ? "" : formatCurrency(product.costCents)
    case "brand":
      return product.brand ?? ""
    case "model":
      return product.model ?? ""
    case "size":
      return product.size ?? ""
    case "color":
      return product.color ?? ""
    case "description":
      return product.description ?? ""
    case "controlNumber":
      return product.controlNumber ?? ""
    case "imageUrl":
      return product.imageUrl ?? ""
    case "createdAt":
      return formatDateSafe(product.createdAt)
    case "updatedAt":
      return formatDateSafe(product.updatedAt)
    default:
      return ""
  }
}

function autoColumns(rows: string[][]): XLSX.ColInfo[] {
  const colCount = rows[0]?.length ?? 0
  const cols: XLSX.ColInfo[] = []

  for (let colIndex = 0; colIndex < colCount; colIndex++) {
    let maxLen = 10
    for (const row of rows) {
      const value = row[colIndex] ?? ""
      const asString = String(value)
      if (asString.length > maxLen) {
        maxLen = asString.length
      }
    }
    cols.push({ wch: Math.min(maxLen + 2, 100) })
  }

  return cols
}

function applyLeftAlignment(ws: XLSX.WorkSheet) {
  if (!ws["!ref"]) return
  const range = XLSX.utils.decode_range(ws["!ref"])

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = ws[addr]
      if (!cell) continue
      cell.s = {
        ...(cell.s ?? {}),
        alignment: {
          ...(cell.s?.alignment ?? {}),
          horizontal: "left",
          vertical: "top",
          wrapText: true,
        },
      }
    }
  }
}

function normalizeSheetName(name: string, fallback: string): string {
  const clean = name.replace(/[\\/?*\[\]:]/g, " ").trim()
  const finalName = clean || fallback
  return finalName.slice(0, 31)
}

export function ProductExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [columns, setColumns] = useState<ProductExportColumn[]>(() =>
    cloneColumns(DEFAULT_COLUMNS)
  )

  const selectedCount = useMemo(
    () => columns.filter((column) => column.selected).length,
    [columns]
  )

  function toggleColumn(index: number, checked: boolean) {
    setColumns((prev) => {
      const next = cloneColumns(prev)
      next[index].selected = checked
      return next
    })
  }

  function moveColumn(index: number, direction: -1 | 1) {
    setColumns((prev) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const next = cloneColumns(prev)
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  function setAllColumns(selected: boolean) {
    setColumns((prev) => prev.map((column) => ({ ...column, selected })))
  }

  function exportToExcel() {
    const selectedColumns = columns.filter((column) => column.selected)

    if (selectedColumns.length === 0) {
      toast.error("Selecione pelo menos uma coluna para exportar.")
      return
    }

    const products = getProducts()
    if (products.length === 0) {
      toast.error("Nao ha produtos cadastrados para exportar.")
      return
    }

    const workbook = XLSX.utils.book_new()
    let sheetCount = 0

    for (const [category, categoryLabel] of Object.entries(
      PRODUCT_CATEGORY_LABELS
    ) as [ProductCategory, string][]) {
      const categoryProducts = products.filter((product) => product.category === category)
      if (categoryProducts.length === 0) continue

      const header = selectedColumns.map((column) => column.label)
      const body = categoryProducts.map((product) =>
        selectedColumns.map((column) => getColumnValue(product, column.id))
      )
      const rows = [header, ...body]

      const sheet = XLSX.utils.aoa_to_sheet(rows)
      sheet["!cols"] = autoColumns(rows)
      applyLeftAlignment(sheet)

      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        normalizeSheetName(categoryLabel, category)
      )
      sheetCount += 1
    }

    if (sheetCount === 0) {
      toast.error("Nao foi possivel montar abas de categoria para exportacao.")
      return
    }

    const dateSuffix = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `relatorio-produtos-${dateSuffix}.xlsx`, {
      cellStyles: true,
    })

    toast.success(`Arquivo exportado com ${sheetCount} aba(s) de categoria.`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar relatorio de produtos</DialogTitle>
          <DialogDescription>
            Selecione as colunas e organize a ordem. O Excel sera gerado com uma aba por categoria.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Colunas selecionadas: {selectedCount}/{columns.length}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAllColumns(true)}>
            Marcar todas
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAllColumns(false)}>
            Limpar selecao
          </Button>
        </div>

        <ScrollArea className="max-h-[52vh] rounded-md border border-border">
          <div className="divide-y divide-border">
            {columns.map((column, index) => (
              <div
                key={column.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2"
              >
                <Checkbox
                  checked={column.selected}
                  onCheckedChange={(value) => toggleColumn(index, value === true)}
                  aria-label={`Incluir coluna ${column.label}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{column.label}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => moveColumn(index, -1)}
                    disabled={index === 0}
                    title="Mover para cima"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => moveColumn(index, 1)}
                    disabled={index === columns.length - 1}
                    title="Mover para baixo"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={exportToExcel} disabled={selectedCount === 0}>
            <Download className="size-4" />
            Exportar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
