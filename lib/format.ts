import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100)
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR })
}

export function formatDateShort(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR })
}

export function formatDateLabel(iso: string): string {
  return format(parseISO(iso), "dd/MM", { locale: ptBR })
}

export function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/[^\d]/g, "")
  return parseInt(cleaned, 10) || 0
}

export function formatCurrencyInput(cents: number): string {
  if (cents === 0) return ""
  return (cents / 100).toFixed(2).replace(".", ",")
}
