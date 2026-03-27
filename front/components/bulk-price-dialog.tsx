"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { CurrencyInput } from "@/components/currency-input"
import { PercentInput } from "@/components/percent-input"
import { upsertProduct } from "@/lib/db"
import { formatCurrency, formatPercentMaskInput } from "@/lib/format"
import { syncToServer } from "@/lib/sync"
import type { Product } from "@/lib/types"
import { toast } from "sonner"

type Mode = "percent" | "delta_reais" | "fixed_all_reais"

function describeOperation(
  mode: Mode,
  percentHundredths: number,
  deltaCents: number,
  fixedCents: number,
  count: number
): string {
  if (mode === "percent") {
    if (percentHundredths === 0) return `${count} produto(s)`
    const v = percentHundredths / 100
    const absStr = formatPercentMaskInput(Math.abs(percentHundredths))
    const s = v >= 0 ? `aumento de ${absStr}%` : `redução de ${absStr}%`
    return `${s} no preço de ${count} produto(s)`
  }
  if (mode === "fixed_all_reais") {
    return `definir o preço de todos os ${count} produto(s) para ${formatCurrency(fixedCents)}`
  }
  const abs = formatCurrency(Math.abs(deltaCents))
  if (deltaCents >= 0) return `acréscimo de ${abs} em cada um dos ${count} produto(s)`
  return `redução de ${abs} em cada um dos ${count} produto(s)`
}

export type BulkPriceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onApplied: () => void
}

export function BulkPriceDialog({
  open,
  onOpenChange,
  products,
  onApplied,
}: BulkPriceDialogProps) {
  const [mode, setMode] = useState<Mode>("percent")
  const [percentHundredths, setPercentHundredths] = useState(0)
  const [deltaCents, setDeltaCents] = useState(0)
  const [fixedCents, setFixedCents] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setPercentHundredths(0)
      setDeltaCents(0)
      setFixedCents(0)
      setMode("percent")
      setConfirmOpen(false)
    }
  }, [open])

  function validate(): string | null {
    if (products.length === 0) return "Nenhum produto selecionado."
    if (mode === "percent") {
      if (percentHundredths === 0) {
        return "Informe um percentual (ex.: digite 1000 para 10,00%)."
      }
      return null
    }
    if (mode === "fixed_all_reais") {
      if (fixedCents < 0) return "O preço não pode ser negativo."
      return null
    }
    return null
  }

  function handleOpenConfirm() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setConfirmOpen(true)
  }

  function applyChanges() {
    const err = validate()
    if (err) {
      toast.error(err)
      setConfirmOpen(false)
      return
    }

    const pct = percentHundredths / 100

    for (const p of products) {
      let newCents: number
      if (mode === "percent") {
        newCents = Math.max(0, Math.round(p.priceCents * (1 + pct / 100)))
      } else if (mode === "fixed_all_reais") {
        newCents = Math.max(0, fixedCents)
      } else {
        newCents = Math.max(0, p.priceCents + deltaCents)
      }
      upsertProduct({
        id: p.id,
        name: p.name,
        category: p.category,
        priceCents: newCents,
      })
    }

    setConfirmOpen(false)
    onOpenChange(false)
    onApplied()
    toast.success(`Preços atualizados (${products.length} produto(s)).`)
    syncToServer().catch(() => {})
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"))
    }
  }

  const operationText = describeOperation(
    mode,
    percentHundredths,
    deltaCents,
    fixedCents,
    products.length
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar preço em massa</DialogTitle>
            <DialogDescription>
              {products.length} produto(s) selecionado(s). O novo preço será calculado para cada item e
              sincronizado com o servidor quando possível.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="grid gap-3"
            >
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <RadioGroupItem value="percent" id="bp-percent" className="mt-1" />
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="bp-percent" className="font-medium cursor-pointer">
                    Ajuste percentual
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Mesma digitação que valor em reais: só números; as duas últimas casas são decimais.
                    Ex.: <strong>1000</strong> = 10,00% · <strong>550</strong> = 5,50% · use <strong>-</strong> no
                    início para reduzir (ex.: <strong>-500</strong> = −5,00%).
                  </p>
                  {mode === "percent" && (
                    <PercentInput
                      id="bp-percent-input"
                      value={percentHundredths}
                      onChange={setPercentHundredths}
                      placeholder="0,00"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <RadioGroupItem value="delta_reais" id="bp-reais" className="mt-1" />
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="bp-reais" className="font-medium cursor-pointer">
                    Somar ou subtrair reais em cada produto
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Valores com máscara em R$. Use o sinal negativo para subtrair de cada preço. Mínimo R$ 0,00
                    por produto.
                  </p>
                  {mode === "delta_reais" && (
                    <CurrencyInput
                      id="bp-reais-input"
                      value={deltaCents}
                      onChange={setDeltaCents}
                      allowNegative
                      placeholder="0,00"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <RadioGroupItem value="fixed_all_reais" id="bp-fixed-all" className="mt-1" />
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="bp-fixed-all" className="font-medium cursor-pointer">
                    Mesmo preço para todos
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Todos os selecionados passam a custar exatamente o valor em R$ abaixo.
                  </p>
                  {mode === "fixed_all_reais" && (
                    <CurrencyInput
                      id="bp-fixed-all-input"
                      value={fixedCents}
                      onChange={setFixedCents}
                      placeholder="0,00"
                    />
                  )}
                </div>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleOpenConfirm}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de preços?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <span className="block">
                Tem certeza que deseja realizar esta operação? Isso não pode ser desfeito automaticamente.
              </span>
              <span className="block font-medium text-foreground">{operationText}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não, voltar</AlertDialogCancel>
            <AlertDialogAction onClick={applyChanges}>Sim, alterar preços</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
