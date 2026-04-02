"use client"

import { useEffect, useMemo, useState } from "react"
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
import { adjustStock } from "@/lib/db"
import { syncToServer } from "@/lib/sync"
import type { Product } from "@/lib/types"
import { toast } from "sonner"

interface StockAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onAdjusted: () => void
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  onAdjusted,
}: StockAdjustDialogProps) {
  const [delta, setDelta] = useState("")
  const [reason, setReason] = useState("")
  const [selectedSizeId, setSelectedSizeId] = useState("")

  const sizeOptions = useMemo(
    () =>
      product?.category === "tenis"
        ? product.tennisSizes ?? []
        : product?.category === "roupas"
          ? product.clothingSizes ?? []
          : [],
    [product]
  )

  useEffect(() => {
    if (!open) return
    if (sizeOptions.length > 0) {
      setSelectedSizeId((prev) => prev || sizeOptions[0].id)
    } else {
      setSelectedSizeId("")
    }
  }, [open, sizeOptions])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!product) return

    const value = parseInt(delta, 10)
    if (isNaN(value) || value === 0) {
      toast.error("Informe uma quantidade valida (diferente de zero)")
      return
    }

    const result = adjustStock(
      product.id,
      value,
      reason || null,
      product.category === "tenis" || product.category === "roupas" ? selectedSizeId : null
    )
    if (!result) {
      toast.error("Estoque nao pode ficar negativo")
      return
    }

    const selectedLabel =
      product.category === "tenis" || product.category === "roupas"
        ? sizeOptions.find((size) => size.id === selectedSizeId)?.number
        : null
    toast.success(
      `Estoque ${value > 0 ? "acrescido" : "reduzido"} em ${Math.abs(value)} unidade(s)${
        selectedLabel ? ` (Tam ${selectedLabel})` : ""
      }`
    )
    setDelta("")
    setReason("")
    onOpenChange(false)
    onAdjusted()
    syncToServer().catch(() => {})
  }

  function handleClose() {
    setDelta("")
    setReason("")
    setSelectedSizeId("")
    onOpenChange(false)
  }

  if (!product) return null

  const parsedDelta = parseInt(delta, 10) || 0
  const selectedSize = sizeOptions.find((size) => size.id === selectedSizeId) ?? null
  const currentStock = selectedSize ? selectedSize.stock : product.stock
  const newStock = currentStock + parsedDelta

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar Estoque</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {(product.category === "tenis" || product.category === "roupas") && sizeOptions.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="stock-size">Tamanho</Label>
              <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                <SelectTrigger id="stock-size">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {sizeOptions.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      {`Tam ${size.number} (Estoque: ${size.stock})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Estoque total do modelo: {product.stock}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Estoque atual{selectedSize ? ` (Tam ${selectedSize.number})` : ""}
            </span>
            <span className="text-lg font-semibold text-foreground">
              {currentStock}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="stock-delta">
              Quantidade (positivo = entrada, negativo = saida)
            </Label>
            <Input
              id="stock-delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="Ex: 10 ou -5"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="stock-reason">
              Justificativa <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="stock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Produto vencido, inventario, devolucao..."
              rows={2}
              className="resize-none"
            />
          </div>

          {delta && parsedDelta !== 0 && (
            <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Novo estoque
              </span>
              <span
                className={`text-lg font-semibold ${
                  newStock < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {newStock}
              </span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                newStock < 0 ||
                ((product.category === "tenis" || product.category === "roupas") &&
                  sizeOptions.length > 0 &&
                  !selectedSizeId)
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
