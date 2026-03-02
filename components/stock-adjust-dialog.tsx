"use client"

import { useState } from "react"
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
import { adjustStock } from "@/lib/db"
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!product) return

    const value = parseInt(delta, 10)
    if (isNaN(value) || value === 0) {
      toast.error("Informe uma quantidade valida (diferente de zero)")
      return
    }

    const result = adjustStock(product.id, value, reason || null)
    if (!result) {
      toast.error("Estoque nao pode ficar negativo")
      return
    }

    toast.success(
      `Estoque ${value > 0 ? "acrescido" : "reduzido"} em ${Math.abs(value)} unidade(s)`
    )
    setDelta("")
    setReason("")
    onOpenChange(false)
    onAdjusted()
  }

  function handleClose() {
    setDelta("")
    setReason("")
    onOpenChange(false)
  }

  if (!product) return null

  const parsedDelta = parseInt(delta, 10) || 0
  const newStock = product.stock + parsedDelta

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar Estoque</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">Estoque atual</span>
            <span className="text-lg font-semibold text-foreground">
              {product.stock}
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
            <Button type="submit" disabled={newStock < 0}>
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
