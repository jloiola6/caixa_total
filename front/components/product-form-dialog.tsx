"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { BarcodeScanner } from "@/components/barcode-scanner"
import { upsertProduct, getAllBarcodes } from "@/lib/db"
import { syncProductsAfterMutation } from "@/lib/sync"
import { ensureOnlinePolicyAllowsWrite } from "@/lib/offline-mode"
import type { Product, ProductCategory } from "@/lib/types"
import { PRODUCT_CATEGORY_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Plus,
  Printer,
  Shuffle,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import JsBarcode from "jsbarcode"
import { useIsMobile } from "@/hooks/use-mobile"

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
const CONTROL_TYPE_OPTIONS = ["Televisão", "Receptor", "Ar condicionado", "projetor"] as const
type SizeStockRow = { id: string; size: string; stock: number }
const FORM_STEPS = ["Identificacao", "Detalhes", "Precos"] as const
type FormStep = 0 | 1 | 2

function createSizeStockRow(): SizeStockRow {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { id, size: "", stock: 0 }
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: ProductFormDialogProps) {
  const isMobile = useIsMobile()
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [priceCents, setPriceCents] = useState(0)
  const [costCents, setCostCents] = useState(0)
  const [stock, setStock] = useState(0)
  const [category, setCategory] = useState<ProductCategory>("diversos")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [brand, setBrand] = useState("")
  const [controlType, setControlType] = useState("")
  const [model, setModel] = useState("")
  const [size, setSize] = useState("")
  const [color, setColor] = useState("")
  const [description, setDescription] = useState("")
  const [controlNumber, setControlNumber] = useState("")
  const [tennisSizes, setTennisSizes] = useState<SizeStockRow[]>(() => [createSizeStockRow()])
  const [clothingSizes, setClothingSizes] = useState<SizeStockRow[]>(() => [createSizeStockRow()])
  const [barcodeSvg, setBarcodeSvg] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<FormStep>(0)
  const [scannerOpen, setScannerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!product

  function generateBarcodeForForm(showToastFeedback = false): boolean {
    try {
      const existing = getAllBarcodes()
      if (product?.barcode) existing.delete(product.barcode)
      const newBarcode = generateEAN13(existing)
      setBarcode(newBarcode)
      setBarcodeSvg(renderBarcodeSvg(newBarcode))
      if (showToastFeedback) {
        toast.success("Código de barras gerado")
      }
      return true
    } catch {
      if (showToastFeedback) {
        toast.error("Erro ao gerar código de barras")
      }
      return false
    }
  }

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
      setControlType(product.category === "controles" ? product.type || product.brand || "" : "")
      setModel(product.model || "")
      setSize(product.size || "")
      setColor(product.color || "")
      setDescription(product.description || "")
      setControlNumber(product.controlNumber || "")
      if (product.category === "tenis" && product.tennisSizes && product.tennisSizes.length > 0) {
        setTennisSizes(
          product.tennisSizes.map((item) => ({
            id: item.id,
            size: item.number,
            stock: item.stock,
          }))
        )
      } else {
        setTennisSizes([
          {
            id: createSizeStockRow().id,
            size: product.size || "",
            stock: product.stock,
          },
        ])
      }
      if (product.category === "roupas" && product.clothingSizes && product.clothingSizes.length > 0) {
        setClothingSizes(
          product.clothingSizes.map((item) => ({
            id: item.id,
            size: item.number,
            stock: item.stock,
          }))
        )
      } else {
        setClothingSizes([
          {
            id: createSizeStockRow().id,
            size: product.size || "",
            stock: product.stock,
          },
        ])
      }
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
      setControlType("")
      setModel("")
      setSize("")
      setColor("")
      setDescription("")
      setControlNumber("")
      setTennisSizes([createSizeStockRow()])
      setClothingSizes([createSizeStockRow()])
      if (open) {
        const generated = generateBarcodeForForm(false)
        if (!generated) {
          setBarcode("")
          setBarcodeSvg(null)
        }
      } else {
        setBarcode("")
        setBarcodeSvg(null)
      }
    }
  }, [product, open])

  useEffect(() => {
    if (isEditing) return
    if (category === "tenis" && tennisSizes.length === 0) {
      setTennisSizes([createSizeStockRow()])
    }
    if (category === "roupas" && clothingSizes.length === 0) {
      setClothingSizes([createSizeStockRow()])
    }
  }, [category, clothingSizes.length, isEditing, tennisSizes.length])

  useEffect(() => {
    if (open) {
      setCurrentStep(0)
      return
    }
    setScannerOpen(false)
  }, [open, product?.id])

  function handleGenerateBarcode() {
    generateBarcodeForForm(true)
  }

  function handleBarcodeScanned(code: string) {
    setBarcode(code)
    setBarcodeSvg(code.length >= 4 ? renderBarcodeSvg(code) : null)
  }

  function validateStep(step: FormStep): boolean {
    if (step === 0) {
      if (!name.trim()) {
        toast.error("Nome do produto e obrigatorio")
        return false
      }
      if (!category) {
        toast.error("Categoria e obrigatoria")
        return false
      }
    }

    if (step === 2) {
      if (priceCents <= 0) {
        toast.error("Preco de venda deve ser maior que zero")
        return false
      }
    }

    return true
  }

  function goToNextStep() {
    if (!validateStep(currentStep)) return
    setCurrentStep((prev) => Math.min(2, prev + 1) as FormStep)
  }

  function goToPreviousStep() {
    setCurrentStep((prev) => Math.max(0, prev - 1) as FormStep)
  }

  function handleContinueClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    goToNextStep()
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

  function handleZeroPrefixedNumberFocus(e: React.FocusEvent<HTMLInputElement>) {
    if (e.target.value === "0") {
      e.target.select()
    }
  }

  async function runSyncAfterLocalSave(products: Product[]) {
    const result = await syncProductsAfterMutation(products)
    if (!result.ok) {
      toast.error(result.error ?? "Falha ao sincronizar com o servidor")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (currentStep < 2) {
      goToNextStep()
      return
    }

    if (!name.trim()) {
      toast.error("Nome do produto e obrigatorio")
      return
    }
    if (priceCents <= 0) {
      toast.error("Preco de venda deve ser maior que zero")
      return
    }

    const onlinePolicyCheck = await ensureOnlinePolicyAllowsWrite()
    if (!onlinePolicyCheck.allowed) {
      toast.error(onlinePolicyCheck.error ?? "Operacao bloqueada")
      return
    }

    if (category === "tenis") {
      const normalized = tennisSizes
        .map((row) => ({
          id: row.id,
          size: row.size.trim(),
          stock: Number.isFinite(row.stock) ? Math.max(0, Math.floor(row.stock)) : 0,
        }))
        .filter((row) => row.size !== "")

      if (normalized.length === 0) {
        toast.error("Adicione ao menos uma numeracao para o tenis")
        return
      }

      const seen = new Set<string>()
      for (const row of normalized) {
        const key = row.size.toLowerCase()
        if (seen.has(key)) {
          toast.error(`Numeracao duplicada: ${row.size}`)
          return
        }
        seen.add(key)
      }

      const nowIso = new Date().toISOString()
      const savedProduct = upsertProduct({
        id: product?.id,
        name: name.trim(),
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        priceCents,
        costCents: costCents > 0 ? costCents : null,
        stock: normalized.reduce((sum, row) => sum + row.stock, 0),
        category,
        imageUrl,
        type: null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        size: null,
        color: color.trim() || null,
        description: description.trim() || null,
        controlNumber: null,
        tennisSizes: normalized.map((row) => ({
          id: row.id,
          number: row.size,
          stock: row.stock,
          sku: null,
          barcode: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
        clothingSizes: null,
      })

      toast.success(
        isEditing
          ? "Tenis atualizado com sucesso"
          : `Tenis cadastrado com ${normalized.length} numeracao(oes)`
      )
      onOpenChange(false)
      onSaved()
      void runSyncAfterLocalSave([savedProduct])
      return
    }

    if (category === "roupas") {
      const normalized = clothingSizes
        .map((row) => ({
          id: row.id,
          size: row.size.trim(),
          stock: Number.isFinite(row.stock) ? Math.max(0, Math.floor(row.stock)) : 0,
        }))
        .filter((row) => row.size !== "")

      if (normalized.length === 0) {
        toast.error("Adicione ao menos um tamanho para a roupa")
        return
      }

      const seen = new Set<string>()
      for (const row of normalized) {
        const key = row.size.toLowerCase()
        if (seen.has(key)) {
          toast.error(`Tamanho duplicado: ${row.size}`)
          return
        }
        seen.add(key)
      }

      const nowIso = new Date().toISOString()
      const savedProduct = upsertProduct({
        id: product?.id,
        name: name.trim(),
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        priceCents,
        costCents: costCents > 0 ? costCents : null,
        stock: normalized.reduce((sum, row) => sum + row.stock, 0),
        category,
        imageUrl,
        type: null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        size: null,
        color: color.trim() || null,
        description: description.trim() || null,
        controlNumber: null,
        tennisSizes: null,
        clothingSizes: normalized.map((row) => ({
          id: row.id,
          number: row.size,
          stock: row.stock,
          sku: null,
          barcode: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
      })

      toast.success(
        isEditing
          ? "Roupa atualizada com sucesso"
          : `Roupa cadastrada com ${normalized.length} tamanho(s)`
      )
      onOpenChange(false)
      onSaved()
      void runSyncAfterLocalSave([savedProduct])
      return
    }

    const savedProduct = upsertProduct({
      id: product?.id,
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      priceCents,
      costCents: costCents > 0 ? costCents : null,
      stock: isEditing ? product!.stock : stock,
      category,
      imageUrl,
      type: category === "controles" ? controlType.trim() || null : null,
      brand: category === "controles" ? null : brand.trim() || null,
      model: model.trim() || null,
      size: size.trim() || null,
      color: color.trim() || null,
      description: description.trim() || null,
      controlNumber: controlNumber.trim() || null,
    })

    toast.success(isEditing ? "Produto atualizado" : "Produto cadastrado")
    onOpenChange(false)
    onSaved()
    void runSyncAfterLocalSave([savedProduct])
  }

  const showBrand = category === "roupas" || category === "tenis"
  const showControlType = category === "controles"
  const showModel = category === "tenis" || category === "controles" || category === "eletronicos"
  const showSize = false
  const showTennisSizesTable = category === "tenis"
  const showClothingSizesTable = category === "roupas"
  const showColor = category === "roupas" || category === "tenis"
  const showControlNumber = category === "controles"
  const showDescription = true
  const controlTypeOptions = controlType && !(CONTROL_TYPE_OPTIONS as readonly string[]).includes(controlType)
    ? [controlType, ...CONTROL_TYPE_OPTIONS]
    : CONTROL_TYPE_OPTIONS
  const summaryStock =
    category === "tenis"
      ? tennisSizes.reduce((sum, row) => sum + (Number.isFinite(row.stock) ? Math.max(0, row.stock) : 0), 0)
      : category === "roupas"
        ? clothingSizes.reduce((sum, row) => sum + (Number.isFinite(row.stock) ? Math.max(0, row.stock) : 0), 0)
        : stock

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="w-[calc(100%-1rem)] sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[86svh] sm:max-h-[84svh]"
        >
          <form onSubmit={handleSubmit} className="flex min-h-[60svh] max-h-[86svh] sm:max-h-[84svh] flex-col">
          <DialogHeader className="border-b px-4 py-4 sm:px-6 sm:py-5">
            <DialogTitle className="text-2xl sm:text-[34px] leading-tight">
              {isEditing ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 pl-2 pr-2 sm:gap-5">
              {FORM_STEPS.map((stepLabel, index) => {
                const isCompleted = currentStep > index
                const isCurrent = currentStep === index
                return (
                  <div
                    key={stepLabel}
                    className={cn(
                      "flex min-w-fit items-center",
                      index < FORM_STEPS.length - 1 && "flex-1"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        isCompleted && "border-zinc-900 bg-zinc-900 text-white",
                        isCurrent && !isCompleted && "border-zinc-900 text-zinc-900",
                        !isCurrent && !isCompleted && "border-zinc-200 text-zinc-500"
                      )}
                    >
                      {isCompleted ? <Check className="size-3.5" /> : index + 1}
                    </div>
                    <span
                      className={cn(
                        "ml-1.5 text-xs font-medium sm:ml-2 sm:text-sm",
                        isCurrent || isCompleted ? "text-zinc-900" : "text-zinc-500"
                      )}
                    >
                      {stepLabel}
                    </span>
                    {index < FORM_STEPS.length - 1 && (
                      <div className="ml-3 hidden h-px flex-1 bg-zinc-300 sm:block" />
                    )}
                  </div>
                )
              })}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
            {currentStep === 0 && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col items-start gap-4 sm:flex-row">
                  {imageUrl ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          fileInputRef.current?.click()
                        }
                      }}
                      className="relative size-20 cursor-pointer rounded-xl border border-border overflow-hidden bg-muted shrink-0"
                      title="Trocar foto"
                    >
                      <img
                        src={imageUrl}
                        alt="Foto do produto"
                        className="size-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setImageUrl(null)
                        }}
                        className="absolute top-1 right-1 rounded-full bg-background/85 p-0.5 hover:bg-background"
                        aria-label="Remover foto"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <ImagePlus className="size-5" />
                      <span className="text-[10px]">Adicionar</span>
                    </button>
                  )}
                  <div className="w-full flex-1">
                    <Label htmlFor="prod-name">Nome *</Label>
                    <Input
                      id="prod-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nome do produto"
                      autoFocus
                      className="mt-1"
                    />
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />

                <div className="w-full sm:max-w-[260px]">
                  <Label htmlFor="prod-category">Categoria *</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)}>
                    <SelectTrigger id="prod-category" className="mt-1">
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="prod-sku">SKU</Label>
                    <Input
                      id="prod-sku"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="Ex: SKU-001"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="prod-barcode">Codigo de Barras</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        id="prod-barcode"
                        value={barcode}
                        onChange={(e) => {
                          const val = e.target.value
                          setBarcode(val)
                          setBarcodeSvg(val.length >= 4 ? renderBarcodeSvg(val) : null)
                        }}
                        placeholder="Ex: 7891000..."
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleGenerateBarcode}
                        title="Gerar codigo aleatorio"
                      >
                        <Shuffle className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setScannerOpen(true)}
                        title="Escanear codigo de barras"
                      >
                        <Camera className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {barcodeSvg && (
                  <div className="rounded-xl border border-border p-3">
                    <div
                      dangerouslySetInnerHTML={{ __html: barcodeSvg }}
                      className="flex justify-center [&>svg]:h-auto [&>svg]:max-w-full"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePrintBarcode}
                      className="mt-2 gap-1.5"
                    >
                      <Printer className="size-3.5" />
                      Imprimir
                    </Button>
                  </div>
                )}
              </div>
            )}

            {currentStep === 1 && (
              <div className="flex flex-col gap-5">
                {(showBrand || showControlType || showModel) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {showBrand && (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="prod-brand">Marca</Label>
                        <Input
                          id="prod-brand"
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          placeholder="Ex: Nike, Samsung..."
                        />
                      </div>
                    )}
                    {showControlType && (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="prod-type">Tipo</Label>
                        <Select
                          value={controlType || undefined}
                          onValueChange={setControlType}
                        >
                          <SelectTrigger id="prod-type">
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {controlTypeOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {showModel && (
                      <div className="flex flex-col gap-1">
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

                {(showSize || showColor) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {showSize && (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="prod-size">Tamanho</Label>
                        <Input
                          id="prod-size"
                          value={size}
                          onChange={(e) => setSize(e.target.value)}
                          placeholder="Ex: P, M, G, GG..."
                        />
                      </div>
                    )}
                    {showColor && (
                      <div className="flex flex-col gap-1">
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

                {showControlNumber && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="prod-control-number">Numeracao do Controle</Label>
                    <Input
                      id="prod-control-number"
                      value={controlNumber}
                      onChange={(e) => setControlNumber(e.target.value)}
                      placeholder="Ex: BN59-01199F"
                    />
                  </div>
                )}

                {showDescription && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="prod-description">Descricao</Label>
                    <Textarea
                      id="prod-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Detalhes sobre o produto..."
                      rows={10}
                    />
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="prod-price">Preco de Venda *</Label>
                    <CurrencyInput
                      id="prod-price"
                      value={priceCents}
                      onChange={setPriceCents}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="prod-cost">Custo</Label>
                    <CurrencyInput
                      id="prod-cost"
                      value={costCents}
                      onChange={setCostCents}
                    />
                  </div>
                </div>

                {!isEditing && category !== "tenis" && category !== "roupas" && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="prod-stock">Estoque Inicial</Label>
                    <Input
                      id="prod-stock"
                      type="number"
                      min={0}
                      value={stock}
                      onFocus={handleZeroPrefixedNumberFocus}
                      onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                )}

                {showTennisSizesTable && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Numeracoes e Estoque *</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          setTennisSizes((prev) => [...prev, createSizeStockRow()])
                        }
                      >
                        <Plus className="size-3.5" />
                        Adicionar
                      </Button>
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="grid grid-cols-[minmax(0,1fr)_88px_40px] sm:grid-cols-[1fr_120px_44px] bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground sm:px-3">
                        <span>Numeracao</span>
                        <span>Estoque</span>
                        <span></span>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-border">
                        {tennisSizes.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[minmax(0,1fr)_88px_40px] sm:grid-cols-[1fr_120px_44px] items-center gap-2 p-2"
                          >
                            <Input
                              value={row.size}
                              onChange={(e) =>
                                setTennisSizes((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id ? { ...item, size: e.target.value } : item
                                  )
                                )
                              }
                              placeholder="Ex: 38, 39, 40..."
                            />
                            <Input
                              type="number"
                              min={0}
                              value={row.stock}
                              onFocus={handleZeroPrefixedNumberFocus}
                              onChange={(e) =>
                                setTennisSizes((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id
                                      ? { ...item, stock: Math.max(0, parseInt(e.target.value) || 0) }
                                      : item
                                  )
                                )
                              }
                              placeholder="0"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              disabled={tennisSizes.length === 1}
                              onClick={() =>
                                setTennisSizes((prev) => {
                                  if (prev.length === 1) return prev
                                  return prev.filter((item) => item.id !== row.id)
                                })
                              }
                              title="Remover numeracao"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {showClothingSizesTable && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Tamanhos e Estoque *</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          setClothingSizes((prev) => [...prev, createSizeStockRow()])
                        }
                      >
                        <Plus className="size-3.5" />
                        Adicionar
                      </Button>
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="grid grid-cols-[minmax(0,1fr)_88px_40px] sm:grid-cols-[1fr_120px_44px] bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground sm:px-3">
                        <span>Tamanho</span>
                        <span>Estoque</span>
                        <span></span>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-border">
                        {clothingSizes.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[minmax(0,1fr)_88px_40px] sm:grid-cols-[1fr_120px_44px] items-center gap-2 p-2"
                          >
                            <Input
                              value={row.size}
                              onChange={(e) =>
                                setClothingSizes((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id ? { ...item, size: e.target.value } : item
                                  )
                                )
                              }
                              placeholder="Ex: P, M, G, 42..."
                            />
                            <Input
                              type="number"
                              min={0}
                              value={row.stock}
                              onFocus={handleZeroPrefixedNumberFocus}
                              onChange={(e) =>
                                setClothingSizes((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id
                                      ? { ...item, stock: Math.max(0, parseInt(e.target.value) || 0) }
                                      : item
                                  )
                                )
                              }
                              placeholder="0"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              disabled={clothingSizes.length === 1}
                              onClick={() =>
                                setClothingSizes((prev) => {
                                  if (prev.length === 1) return prev
                                  return prev.filter((item) => item.id !== row.id)
                                })
                              }
                              title="Remover tamanho"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-secondary/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary-foreground/75">
                    Resumo
                  </p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
                    <span className="text-secondary-foreground/75">Nome</span>
                    <span className="font-medium text-secondary-foreground">{name || "-"}</span>
                    <span className="text-secondary-foreground/75">Categoria</span>
                    <span className="font-medium text-secondary-foreground">
                      {PRODUCT_CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-secondary-foreground/75">Estoque inicial</span>
                    <span className="font-medium text-secondary-foreground">{summaryStock} un.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-4 py-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
            {currentStep === 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={goToPreviousStep}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" />
                Voltar
              </Button>
            )}

            {!isMobile && (
            <div className="flex items-center gap-2">
              {FORM_STEPS.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "block h-2 w-2 rounded-full bg-zinc-300 transition-all",
                    currentStep === index && "h-2.5 w-6 bg-zinc-900"
                  )}
                />
              ))}
            </div>
            )}

            {currentStep < 2 ? (
              <Button
                type="button"
                onClick={handleContinueClick}
                className="gap-1.5 px-5"
              >
                Continuar
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" className="gap-1.5 px-5">
                <Check className="size-4" />
                {isEditing ? "Salvar" : "Cadastrar"}
              </Button>
            )}
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanned={handleBarcodeScanned}
      />
    </>
  )
}
