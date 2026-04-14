import { getStoredStoreId } from "@/lib/auth-api"

export type PrinterConnectionType = "local" | "wifi"
export type ReceiptCopyType = "seller" | "customer"

export type PrinterSettings = {
  autoPrintEnabled: boolean
  connectionType: PrinterConnectionType
  localPrinterName: string
  wifiHost: string
  wifiPort: number
  printSellerCopy: boolean
  printCustomerCopy: boolean
  cutAfterEachCopy: boolean
  headerText: string
  footerText: string
  updatedAt: string | null
}

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  autoPrintEnabled: false,
  connectionType: "local",
  localPrinterName: "",
  wifiHost: "",
  wifiPort: 9100,
  printSellerCopy: true,
  printCustomerCopy: true,
  cutAfterEachCopy: true,
  headerText: "",
  footerText: "",
  updatedAt: null,
}

function normalizeReceiptCustomText(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 280)
}

function getSettingsStorageKey(): string {
  if (typeof window === "undefined") return "caixatotal_printer_settings"
  const storeId = getStoredStoreId()
  return storeId
    ? `caixatotal_printer_settings_${storeId}`
    : "caixatotal_printer_settings"
}

function normalizePrinterSettings(value: unknown): PrinterSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_PRINTER_SETTINGS }
  const maybe = value as Partial<PrinterSettings> & { enabled?: unknown }
  const connectionType: PrinterConnectionType =
    maybe.connectionType === "wifi" ? "wifi" : "local"
  const wifiPort =
    typeof maybe.wifiPort === "number" && Number.isFinite(maybe.wifiPort)
      ? Math.max(1, Math.floor(maybe.wifiPort))
      : 9100

  return {
    autoPrintEnabled:
      typeof maybe.autoPrintEnabled === "boolean"
        ? maybe.autoPrintEnabled
        : Boolean(maybe.enabled),
    connectionType,
    localPrinterName:
      typeof maybe.localPrinterName === "string" ? maybe.localPrinterName.trim() : "",
    wifiHost: typeof maybe.wifiHost === "string" ? maybe.wifiHost.trim() : "",
    wifiPort,
    printSellerCopy:
      typeof maybe.printSellerCopy === "boolean"
        ? maybe.printSellerCopy
        : DEFAULT_PRINTER_SETTINGS.printSellerCopy,
    printCustomerCopy:
      typeof maybe.printCustomerCopy === "boolean"
        ? maybe.printCustomerCopy
        : DEFAULT_PRINTER_SETTINGS.printCustomerCopy,
    cutAfterEachCopy:
      typeof maybe.cutAfterEachCopy === "boolean"
        ? maybe.cutAfterEachCopy
        : DEFAULT_PRINTER_SETTINGS.cutAfterEachCopy,
    headerText: normalizeReceiptCustomText(maybe.headerText),
    footerText: normalizeReceiptCustomText(maybe.footerText),
    updatedAt:
      typeof maybe.updatedAt === "string" && maybe.updatedAt.trim()
        ? maybe.updatedAt
        : null,
  }
}

export function getPrinterSettings(): PrinterSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PRINTER_SETTINGS }
  try {
    const raw = localStorage.getItem(getSettingsStorageKey())
    if (!raw) return { ...DEFAULT_PRINTER_SETTINGS }
    return normalizePrinterSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS }
  }
}

export function savePrinterSettings(settings: PrinterSettings): PrinterSettings {
  const normalized = normalizePrinterSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  })
  if (typeof window !== "undefined") {
    localStorage.setItem(getSettingsStorageKey(), JSON.stringify(normalized))
  }
  return normalized
}

export function getDefaultPrinterSettings(): PrinterSettings {
  return { ...DEFAULT_PRINTER_SETTINGS }
}
