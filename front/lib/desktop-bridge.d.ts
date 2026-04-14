export {}

type DesktopPrinterConnectionType = "local" | "wifi"

type DesktopPrintOptions = {
  connectionType?: DesktopPrinterConnectionType
  localPrinterName?: string
  wifiHost?: string
  wifiPort?: number
  cutAfterPrint?: boolean
}

declare global {
  interface Window {
    caixaDesktop?: {
      printHtmlSilently: (html: string) => Promise<{
        ok: boolean
        error?: string
      }>
      printTextSilently: (text: string, options?: DesktopPrintOptions) => Promise<{
        ok: boolean
        error?: string
      }>
      listPrinters: () => Promise<{
        ok: boolean
        printers: Array<{ name: string; isDefault: boolean }>
        error?: string
      }>
    }
  }
}
