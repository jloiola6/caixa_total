"use client"

import { useState, useMemo } from "react"
import { Plus, Trash2, CreditCard, Banknote, Landmark, HandCoins } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyInput } from "@/components/currency-input"
import { formatCurrency } from "@/lib/format"
import type { CartItem, PaymentMethod, PaymentSplit } from "@/lib/types"
import { PAYMENT_METHOD_LABELS } from "@/lib/types"

const PAYMENT_ICONS: Record<PaymentMethod, React.ReactNode> = {
  dinheiro: <Banknote className="size-4" />,
  credito: <CreditCard className="size-4" />,
  debito: <Landmark className="size-4" />,
  fiado: <HandCoins className="size-4" />,
}

interface CheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cart: CartItem[]
  cartTotal: number
  onConfirm: (payments: PaymentSplit[], customerName: string | null, customerPhone: string | null) => void
}

export function CheckoutDialog({
  open,
  onOpenChange,
  cart,
  cartTotal,
  onConfirm,
}: CheckoutDialogProps) {
  const [payments, setPayments] = useState<{ method: PaymentMethod; amountCents: number }[]>([
    { method: "dinheiro", amountCents: 0 },
  ])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")

  const totalAssigned = useMemo(
    () => payments.reduce((sum, p) => sum + p.amountCents, 0),
    [payments]
  )

  const remaining = cartTotal - totalAssigned

  function addPayment() {
    setPayments((prev) => [...prev, { method: "dinheiro", amountCents: 0 }])
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index))
  }

  function updatePaymentMethod(index: number, method: PaymentMethod) {
    setPayments((prev) =>
      prev.map((p, i) => (i === index ? { ...p, method } : p))
    )
  }

  function updatePaymentAmount(index: number, amountCents: number) {
    setPayments((prev) =>
      prev.map((p, i) => (i === index ? { ...p, amountCents } : p))
    )
  }

  function fillRemaining(index: number) {
    const otherTotal = payments.reduce(
      (sum, p, i) => (i === index ? sum : sum + p.amountCents),
      0
    )
    const fillAmount = cartTotal - otherTotal
    if (fillAmount > 0) {
      updatePaymentAmount(index, fillAmount)
    }
  }

  function handleSinglePayment(method: PaymentMethod) {
    setPayments([{ method, amountCents: cartTotal }])
  }

  function handleConfirm() {
    const validPayments = payments.filter((p) => p.amountCents > 0)
    onConfirm(
      validPayments,
      customerName.trim() || null,
      customerPhone.trim() || null
    )
    // Reset state
    setPayments([{ method: "dinheiro", amountCents: 0 }])
    setCustomerName("")
    setCustomerPhone("")
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setPayments([{ method: "dinheiro", amountCents: 0 }])
      setCustomerName("")
      setCustomerPhone("")
    }
    onOpenChange(open)
  }

  const cartItemsCount = cart.reduce((sum, item) => sum + item.qty, 0)
  const canConfirm = totalAssigned === cartTotal && cartTotal > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Venda</DialogTitle>
          <DialogDescription>
            {`${cartItemsCount} item(ns) - Total: ${formatCurrency(cartTotal)}`}
          </DialogDescription>
        </DialogHeader>

        {/* Cart summary */}
        <div className="flex flex-col gap-1 text-sm max-h-32 overflow-auto rounded-md bg-muted p-3">
          {cart.map((item) => (
            <div
              key={item.product.id}
              className="flex items-center justify-between py-0.5"
            >
              <span className="text-foreground">
                {item.qty}x {item.product.name}
              </span>
              <span className="text-muted-foreground">
                {formatCurrency(item.product.priceCents * item.qty)}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Quick payment buttons */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Pagamento rapido (valor total)
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
              <Button
                key={method}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleSinglePayment(method)}
              >
                {PAYMENT_ICONS[method]}
                {PAYMENT_METHOD_LABELS[method]}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Split payments */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Formas de pagamento
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs h-7"
              onClick={addPayment}
            >
              <Plus className="size-3" />
              Adicionar
            </Button>
          </div>

          {payments.map((payment, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 min-w-0">
                <Label className="text-xs mb-1 block text-muted-foreground">Metodo</Label>
                <Select
                  value={payment.method}
                  onValueChange={(v) => updatePaymentMethod(index, v as PaymentMethod)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className="flex items-center gap-2">
                          {PAYMENT_ICONS[m]}
                          {PAYMENT_METHOD_LABELS[m]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-0">
                <Label className="text-xs mb-1 block text-muted-foreground">Valor</Label>
                <CurrencyInput
                  value={payment.amountCents}
                  onChange={(v) => updatePaymentAmount(index, v)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs text-muted-foreground shrink-0"
                onClick={() => fillRemaining(index)}
                title="Preencher restante"
              >
                Restante
              </Button>
              {payments.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removePayment(index)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}

          {/* Remaining indicator */}
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Restante</span>
            <span
              className={`font-semibold ${
                remaining === 0
                  ? "text-green-600 dark:text-green-400"
                  : remaining < 0
                    ? "text-destructive"
                    : "text-foreground"
              }`}
            >
              {formatCurrency(remaining)}
            </span>
          </div>
          {remaining < 0 && (
            <p className="text-xs text-destructive">
              O valor dos pagamentos excede o total da venda.
            </p>
          )}
        </div>

        <Separator />

        {/* Customer info */}
        <div className="flex flex-col gap-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Dados do comprador <span className="normal-case font-normal">(opcional)</span>
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-name" className="text-xs text-muted-foreground">
                Nome
              </Label>
              <Input
                id="customer-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do comprador"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-phone" className="text-xs text-muted-foreground">
                Telefone
              </Label>
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Confirmar Venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
