import type { Sale, SaleItem } from "@/lib/types"
import { PAYMENT_METHOD_LABELS } from "@/lib/types"
import { getPrinterSettings } from "@/lib/printer-settings"

type PrintSaleReceiptInput = {
  sale: Sale
  saleItems: SaleItem[]
  operatorName?: string | null
  storeName?: string | null
}

type PrintSaleReceiptResult = {
  ok: boolean
  mode: "desktop-silent-text" | "desktop-silent" | "browser-dialog"
  error?: string
}

type BuildReceiptHtmlOptions = {
  includePrintScript: boolean
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})
const RECEIPT_WIDTH = 48

function formatCurrency(cents: number): string {
  return CURRENCY_FORMATTER.format(cents / 100)
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function sanitizeText(value: string): string {
  const withoutDiacritics = value
    .replaceAll("\u00a0", " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  return withoutDiacritics
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 3) return value.slice(0, maxLength)
  return `${value.slice(0, maxLength - 3)}...`
}

function padEndText(value: string, width: number): string {
  if (value.length >= width) return value
  return value + " ".repeat(width - value.length)
}

function centerText(value: string, width: number): string {
  if (value.length >= width) return value
  const totalPadding = width - value.length
  const left = Math.floor(totalPadding / 2)
  const right = totalPadding - left
  return `${" ".repeat(left)}${value}${" ".repeat(right)}`
}

function buildPairLine(leftRaw: string, rightRaw: string, width: number): string {
  const right = truncateText(sanitizeText(rightRaw), Math.max(1, width - 1))
  const maxLeft = Math.max(1, width - right.length - 1)
  const left = truncateText(sanitizeText(leftRaw), maxLeft)
  return `${padEndText(left, width - right.length)}${right}`
}

function wrapText(valueRaw: string, width: number): string[] {
  const value = sanitizeText(valueRaw)
  if (!value) return [""]

  const words = value.split(" ").filter(Boolean)
  if (words.length === 0) return [""]

  const lines: string[] = []
  let current = ""

  for (const word of words) {
    let remainingWord = word

    if (!current) {
      while (remainingWord.length > width) {
        lines.push(remainingWord.slice(0, width))
        remainingWord = remainingWord.slice(width)
      }
      current = remainingWord
      continue
    }

    const candidate = `${current} ${remainingWord}`
    if (candidate.length <= width) {
      current = candidate
      continue
    }

    lines.push(current)
    while (remainingWord.length > width) {
      lines.push(remainingWord.slice(0, width))
      remainingWord = remainingWord.slice(width)
    }
    current = remainingWord
  }

  if (current) lines.push(current)
  return lines
}

function buildItemRows(saleItems: SaleItem[]): string {
  return saleItems
    .map((item) => {
      const name = escapeHtml(item.productName)
      const sku = item.sku ? `<div class="meta">SKU: ${escapeHtml(item.sku)}</div>` : ""
      return `
        <div class="row">
          <div class="line1">${item.qty}x ${name}</div>
          ${sku}
          <div class="line2">
            <span>${formatCurrency(item.unitPriceCents)} un.</span>
            <strong>${formatCurrency(item.lineTotalCents)}</strong>
          </div>
        </div>
      `
    })
    .join("")
}

function buildPaymentRows(sale: Sale): string {
  return sale.payments
    .map(
      (payment) => `
        <div class="line2">
          <span>${PAYMENT_METHOD_LABELS[payment.method]}</span>
          <strong>${formatCurrency(payment.amountCents)}</strong>
        </div>
      `
    )
    .join("")
}

function buildReceiptHtml(
  input: PrintSaleReceiptInput,
  options: BuildReceiptHtmlOptions
): string {
  const { sale, saleItems, operatorName, storeName } = input
  const title = storeName?.trim() || "CaixaTotal"
  const customerName = sale.customerName?.trim() || "-"
  const customerPhone = sale.customerPhone?.trim() || "-"
  const operator = operatorName?.trim() || "-"
  const safeTitle = escapeHtml(title)
  const printScript = options.includePrintScript
    ? `
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.focus();
              window.print();
              setTimeout(function () { window.close(); }, 300);
            }, 80);
          };
        </script>
      `
    : ""

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Comprovante de Venda</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          html, body { margin: 0; padding: 0; width: 76mm; }
          body {
            font-family: "Courier New", monospace;
            color: #000;
            font-size: 12px;
            line-height: 1.35;
            padding: 2mm;
          }
          .center { text-align: center; }
          .title { font-size: 14px; font-weight: 700; margin-bottom: 2px; }
          .divider {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          .line2 {
            display: flex;
            justify-content: space-between;
            gap: 8px;
          }
          .line1 { font-weight: 600; }
          .meta { color: #222; font-size: 11px; }
          .section-title {
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .row { margin-bottom: 6px; }
          .totals {
            font-size: 13px;
            font-weight: 700;
          }
          .small { font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">${safeTitle}</div>
          <div>COMPROVANTE DE VENDA</div>
        </div>

        <div class="divider"></div>

        <div class="small">Data/Hora: ${formatDateTime(sale.createdAt)}</div>
        <div class="small">Venda: ${escapeHtml(sale.id)}</div>
        <div class="small">Operador: ${escapeHtml(operator)}</div>
        <div class="small">Cliente: ${escapeHtml(customerName)}</div>
        <div class="small">Telefone: ${escapeHtml(customerPhone)}</div>

        <div class="divider"></div>

        <div class="section-title">Itens</div>
        ${buildItemRows(saleItems)}

        <div class="divider"></div>

        <div class="section-title">Pagamentos</div>
        ${buildPaymentRows(sale)}

        <div class="divider"></div>

        <div class="line2 totals">
          <span>Total</span>
          <span>${formatCurrency(sale.totalCents)}</span>
        </div>
        <div class="line2 small">
          <span>Qtd. itens</span>
          <span>${sale.itemsCount}</span>
        </div>

        <div class="divider"></div>

        <div class="center small">Obrigado pela preferencia!</div>

        ${printScript}
      </body>
    </html>
  `
}

function buildReceiptText(input: PrintSaleReceiptInput): string {
  const { sale, saleItems, operatorName, storeName } = input
  const title = sanitizeText(storeName?.trim() || "CaixaTotal")
  const customerName = sanitizeText(sale.customerName?.trim() || "-")
  const customerPhone = sanitizeText(sale.customerPhone?.trim() || "-")
  const operator = sanitizeText(operatorName?.trim() || "-")
  const dateTime = sanitizeText(formatDateTime(sale.createdAt))
  const saleId = sanitizeText(sale.id)
  const divider = "-".repeat(RECEIPT_WIDTH)

  const lines: string[] = []
  lines.push(centerText(title, RECEIPT_WIDTH))
  lines.push(centerText("COMPROVANTE DE VENDA", RECEIPT_WIDTH))
  lines.push(divider)
  lines.push(`Data/Hora: ${dateTime}`)
  lines.push(`Venda: ${saleId}`)
  lines.push(`Operador: ${operator}`)
  lines.push(`Cliente: ${customerName}`)
  lines.push(`Telefone: ${customerPhone}`)
  lines.push(divider)
  lines.push("ITENS")

  for (const item of saleItems) {
    const itemTitle = `${item.qty}x ${sanitizeText(item.productName)}`
    for (const line of wrapText(itemTitle, RECEIPT_WIDTH)) {
      lines.push(line)
    }
    if (item.sku) {
      lines.push(`SKU: ${sanitizeText(item.sku)}`)
    }
    lines.push(
      buildPairLine(
        `${formatCurrency(item.unitPriceCents)} un.`,
        formatCurrency(item.lineTotalCents),
        RECEIPT_WIDTH
      )
    )
  }

  lines.push(divider)
  lines.push("PAGAMENTOS")
  for (const payment of sale.payments) {
    lines.push(
      buildPairLine(
        PAYMENT_METHOD_LABELS[payment.method],
        formatCurrency(payment.amountCents),
        RECEIPT_WIDTH
      )
    )
  }
  lines.push(divider)
  lines.push(buildPairLine("TOTAL", formatCurrency(sale.totalCents), RECEIPT_WIDTH))
  lines.push(buildPairLine("QTD. ITENS", String(sale.itemsCount), RECEIPT_WIDTH))
  lines.push(divider)
  lines.push(centerText("Obrigado pela preferencia!", RECEIPT_WIDTH))
  lines.push("")
  lines.push("")
  lines.push("")

  return lines.join("\n")
}

async function tryDesktopTextSilentPrint(text: string): Promise<PrintSaleReceiptResult | null> {
  if (typeof window === "undefined") return null
  if (!window.caixaDesktop?.printTextSilently) return null

  const printerSettings = getPrinterSettings()
  const printOptions = printerSettings.enabled
    ? {
        connectionType: printerSettings.connectionType,
        localPrinterName: printerSettings.localPrinterName || undefined,
        wifiHost: printerSettings.wifiHost || undefined,
        wifiPort: printerSettings.wifiPort || undefined,
      }
    : undefined

  try {
    const result = await window.caixaDesktop.printTextSilently(text, printOptions)
    return {
      ok: Boolean(result?.ok),
      mode: "desktop-silent-text",
      error: result?.error,
    }
  } catch (error) {
    return {
      ok: false,
      mode: "desktop-silent-text",
      error: error instanceof Error ? error.message : "Falha na impressao silenciosa",
    }
  }
}

function openBrowserPrintDialog(html: string): PrintSaleReceiptResult {
  if (typeof window === "undefined") {
    return {
      ok: false,
      mode: "browser-dialog",
      error: "Ambiente sem janela de navegador",
    }
  }
  const printWindow = window.open("", "_blank", "width=480,height=760")
  if (!printWindow) {
    return {
      ok: false,
      mode: "browser-dialog",
      error: "Nao foi possivel abrir a janela de impressao",
    }
  }

  printWindow.document.write(html)
  printWindow.document.close()
  return { ok: true, mode: "browser-dialog" }
}

function isLikelyElectronRuntime(): boolean {
  if (typeof navigator === "undefined") return false
  return navigator.userAgent.toLowerCase().includes("electron")
}

export async function printSaleReceipt(
  input: PrintSaleReceiptInput
): Promise<PrintSaleReceiptResult> {
  const desktopText = buildReceiptText(input)
  const browserHtml = buildReceiptHtml(input, { includePrintScript: true })
  const desktopResult = await tryDesktopTextSilentPrint(desktopText)
  if (desktopResult) return desktopResult
  if (isLikelyElectronRuntime()) {
    return {
      ok: false,
      mode: "desktop-silent-text",
      error:
        "Integracao de impressao em texto indisponivel. Reinicie o app desktop para carregar a bridge.",
    }
  }
  return openBrowserPrintDialog(browserHtml)
}
