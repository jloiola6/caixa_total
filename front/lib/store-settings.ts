export type StockAlertColors = {
  lowStock: string
  outOfStock: string
  inStock: string
}

export type StockAlertThresholds = {
  lowStock: number
  inStock: number
}

export const DEFAULT_STOCK_ALERT_COLORS: StockAlertColors = {
  lowStock: "#f59e0b",
  outOfStock: "#ef4444",
  inStock: "#22c55e",
}

export const DEFAULT_STOCK_ALERT_THRESHOLDS: StockAlertThresholds = {
  lowStock: 5,
  inStock: 6,
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function normalizeStockThreshold(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  if (normalized < 0) return fallback
  if (normalized > 1000000) return fallback
  return normalized
}

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "").trim().toLowerCase()
  if (!normalized) return fallback
  if (!HEX_COLOR_PATTERN.test(normalized)) return fallback
  return normalized
}

export function resolveStockAlertColors(value: {
  stockAlertLowColor?: string | null
  stockAlertOutColor?: string | null
  stockAlertOkColor?: string | null
} | null | undefined): StockAlertColors {
  return {
    lowStock: normalizeHexColor(
      value?.stockAlertLowColor,
      DEFAULT_STOCK_ALERT_COLORS.lowStock
    ),
    outOfStock: normalizeHexColor(
      value?.stockAlertOutColor,
      DEFAULT_STOCK_ALERT_COLORS.outOfStock
    ),
    inStock: normalizeHexColor(
      value?.stockAlertOkColor,
      DEFAULT_STOCK_ALERT_COLORS.inStock
    ),
  }
}

export function resolveStockAlertThresholds(value: {
  stockAlertLowThreshold?: number | null
  stockAlertAvailableThreshold?: number | null
} | null | undefined): StockAlertThresholds {
  const lowStock = normalizeStockThreshold(
    value?.stockAlertLowThreshold,
    DEFAULT_STOCK_ALERT_THRESHOLDS.lowStock
  )
  const inStock = normalizeStockThreshold(
    value?.stockAlertAvailableThreshold,
    DEFAULT_STOCK_ALERT_THRESHOLDS.inStock
  )
  if (inStock <= lowStock) {
    return {
      lowStock,
      inStock: lowStock + 1,
    }
  }
  return { lowStock, inStock }
}

export function classifyStockLevel(
  stock: number,
  thresholds: StockAlertThresholds
): "out" | "low" | "ok" {
  if (stock <= 0) return "out"
  if (stock <= thresholds.lowStock) return "low"
  if (stock >= thresholds.inStock) return "ok"
  return "low"
}

export function getReadableTextColor(backgroundHex: string): string {
  const normalized = normalizeHexColor(backgroundHex, "#000000")
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance >= 0.62 ? "#111111" : "#ffffff"
}

export function normalizeWhatsappNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d]/g, "")
}
