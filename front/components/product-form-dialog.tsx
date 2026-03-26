"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyInput } from "@/components/currency-input"
import { upsertProduct, getAllBarcodes } from "@/lib/db"
import { syncToServer } from "@/lib/sync"
import type { Product, ProductCategory } from "@/lib/types"
import { PRODUCT_CATEGORY_LABELS } from "@/lib/types"
import { ImagePlus, X, Shuffle, Printer } from "lucide-react"
import { toast } from "sonner"
import JsBarcode from "jsbarcode"

function generateEAN13(existingBarcodes: Set<string>): string {
  const maxAttempts = 1000
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prefix = 20 + Math.floor(Math.random() * 10)
    let digits = prefix.toString()
    for (let i = 0; i < 10; i++) {
      digits += Math.floor(Math.random() * 10).toString()
    }

    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3)
    }
    const checkDigit = (10 - (sum % 10)) % 10
    const ean = digits + checkDigit.toString()

    if (!existingBarcodes.has(ean)) return ean
  }
  throw new Error("Não foi possível gerar um código de barras único")
}

function renderBarcodeSvg(value: string): string | null {
  if (!value) return null
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const opts = { width: 2, height: 80, displayValue: true, fontSize: 14, margin: 10 }

  try {
    JsBarcode(svg, value, { ...opts, format: "EAN13" })
    return new XMLSerializer().serializeToString(svg)
  } catch {
    // Fallback: CODE128 aceita qualquer string
  }

  try {
    JsBarcode(svg, value, { ...opts, format: "CODE128" })
    return new XMLSerializer().serializeToString(svg)
  } catch {
    return null
  }
}

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  onSaved: () => void
}

const CATEGORIES = Object.entries(PRODUCT_CATEGORY_LABELS) as [ProductCategory, string][]

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: ProductFormDialogProps) {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [priceCents, setPriceCents] = useState(0)
  const [costCents, setCostCents] = useState(0)
  const [stock, setStock] = useState(0)
  const [category, setCategory] = useState<ProductCategory>("diversos")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [brand, setBrand] = useState("")
  const [model, setModel] = useState("")
  const [size, setSize] = useState("")
  const [color, setColor] = useState("")
  const [description, setDescription] = useState("")
  const [controlNumber, setControlNumber] = useState("")
  const [barcodeSvg, setBarcodeSvg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!product

  useEffect(() => {
    if (product) {
      setName(product.name)
      setSku(product.sku || "")
      setBarcode(product.barcode || "")
      setPriceCents(product.priceCents)
      setCostCents(product.costCents || 0)
      setStock(product.stock)
      setCategory(product.category || "diversos")
      setImageUrl(product.imageUrl || null)
      setBrand(product.brand || "")
      setModel(product.model || "")
      setSize(product.size || "")
      setColor(product.color || "")
      setDescription(product.description || "")
      setControlNumber(product.controlNumber || "")
      setBarcodeSvg(product.barcode ? renderBarcodeSvg(product.barcode) : null)
    } else {
      setName("")
      setSku("")
      setBarcode("")
      setPriceCents(0)
      setCostCents(0)
      setStock(0)
      setCategory("diversos")
      setImageUrl(null)
      setBrand("")
      setModel("")
      setSize("")
      setColor("")
      setDescription("")
      setControlNumber("")
      setBarcodeSvg(null)
    }
  }, [product, open])

  function handleGenerateBarcode() {
    try {
      const existing = getAllBarcodes()
      if (product?.barcode) existing.delete(product.barcode)
      const newBarcode = generateEAN13(existing)
      setBarcode(newBarcode)
      setBarcodeSvg(renderBarcodeSvg(newBarcode))
      toast.success("Código de barras gerado")
    } catch {
      toast.error("Erro ao gerar código de barras")
    }
  }

  function handlePrintBarcode() {
    if (!barcodeSvg) return
    const printWindow = window.open("", "_blank", "width=400,height=300")
    if (!printWindow) {
      toast.error("Não foi possível abrir a janela de impressão")
      return
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Código de Barras - ${name || "Produto"}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
            .product-name { font-size: 14px; margin-bottom: 8px; font-weight: 600; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${name ? `<div class="product-name">${name}</div>` : ""}
          ${barcodeSvg}
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande. Maximo 2MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImageUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error("Nome do produto e obrigatorio")
      return
    }
    if (priceCents <= 0) {
      toast.error("Preco de venda deve ser maior que zero")
      return
    }

    upsertProduct({
      id: product?.id,
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      priceCents,
      costCents: costCents > 0 ? costCents : null,
      stock: isEditing ? product!.stock : stock,
      category,
      imageUrl,
      brand: brand.trim() || null,
      model: model.trim() || null,
      size: size.trim() || null,
      color: color.trim() || null,
      description: description.trim() || null,
      controlNumber: controlNumber.trim() || null,
    })

    toast.success(isEditing ? "Produto atualizado" : "Produto cadastrado")
    onOpenChange(false)
    onSaved()
    syncToServer().catch(() => {})
  }

  const showBrand = category === "roupas" || category === "tenis" || category === "controles"
  const showModel = category === "tenis" || category === "controles" || category === "eletronicos"
  const showSize = category === "roupas" || category === "tenis"
  const showColor = category === "roupas" || category === "tenis"
  const showControlNumber = category === "controles"
  const showDescription = category === "eletronicos" || category === "diversos" || category === "controles"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Altere os dados do produto."
              : "Preencha os dados do novo produto."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Photo */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              {imageUrl ? (
                <div className="relative size-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0">
                  <img
                    src={imageUrl}
                    alt="Foto do produto"
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 hover:bg-background"
                    aria-label="Remover foto"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors shrink-0"
                >
                  <ImagePlus className="size-5" />
                  <span className="text-[10px]">Adicionar</span>
                </button>
              )}
              {imageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Trocar foto
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {/* Name */}
              <div className="flex flex-col gap-2 w-full">
                <Label htmlFor="prod-name">Nome *</Label>
                <Input
                  id="prod-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do produto"
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="prod-category">Categoria *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)}>
              <SelectTrigger id="prod-category">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Brand + Model */}
          {(showBrand || showModel) && (
            <div className="grid grid-cols-2 gap-4">
              {showBrand && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-brand">Marca</Label>
                  <Input
                    id="prod-brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Ex: Nike, Samsung..."
                  />
                </div>
              )}
              {showModel && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-model">Modelo</Label>
                  <Input
                    id="prod-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ex: Air Max 90..."
                  />
                </div>
              )}
            </div>
          )}

          {/* Size + Color (roupas / tenis) */}
          {(showSize || showColor) && (
            <div className="grid grid-cols-2 gap-4">
              {showSize && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-size">Tamanho</Label>
                  <Input
                    id="prod-size"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder={category === "tenis" ? "Ex: 42, 38..." : "Ex: P, M, G, GG..."}
                  />
                </div>
              )}
              {showColor && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-color">Cor</Label>
                  <Input
                    id="prod-color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Ex: Preto, Azul..."
                  />
                </div>
              )}
            </div>
          )}

          {/* Control Number (controles) */}
          {showControlNumber && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="prod-control-number">Numeracao do Controle</Label>
              <Input
                id="prod-control-number"
                value={controlNumber}
                onChange={(e) => setControlNumber(e.target.value)}
                placeholder="Ex: BN59-01199F"
              />
            </div>
          )}

          {/* Description (eletronicos, diversos, controles) */}
          {showDescription && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="prod-description">Descricao</Label>
              <Textarea
                id="prod-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes sobre o produto..."
                rows={3}
              />
            </div>
          )}

          {/* Barcode */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="prod-barcode">Código de Barras</Label>
            <div className="flex items-center gap-2">
              <Input
                id="prod-barcode"
                value={barcode}
                onChange={(e) => {
                  const val = e.target.value
                  setBarcode(val)
                  setBarcodeSvg(val.length >= 4 ? renderBarcodeSvg(val) : null)
                }}
                placeholder="Ex: 7891000..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGenerateBarcode}
                title="Gerar código aleatório"
              >
                <Shuffle className="size-4" />
              </Button>
            </div>

            {barcodeSvg && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-3">
                <div
                  dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                  className="[&>svg]:max-w-full [&>svg]:h-auto"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrintBarcode}
                  className="gap-1.5"
                >
                  <Printer className="size-3.5" />
                  Imprimir
                </Button>
              </div>
            )}
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="prod-price">Preco de Venda *</Label>
              <CurrencyInput
                id="prod-price"
                value={priceCents}
                onChange={setPriceCents}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prod-cost">Custo</Label>
              <CurrencyInput
                id="prod-cost"
                value={costCents}
                onChange={setCostCents}
              />
            </div>
          </div>

          {/* Initial Stock (only on create) */}
          {!isEditing && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="prod-stock">Estoque Inicial</Label>
              <Input
                id="prod-stock"
                type="number"
                min={0}
                value={stock}
                onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              {isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
