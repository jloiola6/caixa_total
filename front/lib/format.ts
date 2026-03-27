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

/** Mesma lógica de dígitos que `parseCurrencyInput`, com sinal negativo opcional no início (centavos). */
export function parseSignedCurrencyInput(value: string): number {
  const trimmed = value.trimStart()
  const neg = trimmed.startsWith("-")
  const digits = trimmed.replace(/-/g, "").replace(/[^\d]/g, "")
  const n = parseInt(digits, 10) || 0
  return neg ? -n : n
}

export function formatSignedCurrencyInput(cents: number): string {
  if (cents === 0) return ""
  const neg = cents < 0
  const abs = Math.abs(cents)
  const body = formatCurrencyInput(abs)
  return neg ? `-${body}` : body
}

/**
 * Percentual com 2 casas decimais: valor interno = percentual × 100 (ex.: 10,5% → 1050).
 * Digitação igual ao campo de moeda (só números; as duas últimas casas são decimais do percentual).
 */
export function parsePercentMaskInput(value: string): number {
  const trimmed = value.trimStart()
  const neg = trimmed.startsWith("-")
  const digits = trimmed.replace(/-/g, "").replace(/[^\d]/g, "")
  const n = parseInt(digits, 10) || 0
  return neg ? -n : n
}

export function formatPercentMaskInput(hundredthsOfPercent: number): string {
  if (hundredthsOfPercent === 0) return ""
  const neg = hundredthsOfPercent < 0
  const abs = Math.abs(hundredthsOfPercent)
  const body = (abs / 100).toFixed(2).replace(".", ",")
  return neg ? `-${body}` : body
}
