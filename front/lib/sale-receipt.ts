import type { Sale, SaleItem } from "@/lib/types"
import { PAYMENT_METHOD_LABELS } from "@/lib/types"
import {
  getPrinterSettings,
  type PrinterSettings,
  type ReceiptCopyType,
} from "@/lib/printer-settings"

type PrintSaleReceiptInput = {
  sale: Sale
  saleItems: SaleItem[]
  operatorName?: string | null
  storeName?: string | null
  copies?: ReceiptCopyType[]
  respectAutoPrint?: boolean
}

type PrintSaleReceiptResult = {
  ok: boolean
  mode: "desktop-silent-text" | "desktop-silent" | "browser-dialog" | "skipped"
  printedCopies: ReceiptCopyType[]
  skipped?: boolean
  error?: string
}

type BuildReceiptHtmlOptions = {
  includePrintScript: boolean
  copyType: ReceiptCopyType
}

type ReceiptCustomContent = {
  headerLines: string[]
  footerLines: string[]
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})
const RECEIPT_WIDTH = 48
const RECEIPT_COPY_LABELS: Record<ReceiptCopyType, string> = {
  seller: "VIA DO VENDEDOR",
  customer: "VIA DO CLIENTE",
}

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

function normalizeCustomTextLines(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function buildReceiptCustomContent(
  settings: Pick<PrinterSettings, "headerText" | "footerText">
): ReceiptCustomContent {
  return {
    headerLines: normalizeCustomTextLines(settings.headerText),
    footerLines: normalizeCustomTextLines(settings.footerText),
  }
}

function normalizeBonusQty(item: SaleItem): number {
  const explicitRaw = Number(item.bonusQty ?? 0)
  if (Number.isFinite(explicitRaw) && explicitRaw > 0) {
    return Math.min(item.qty, Math.max(0, Math.floor(explicitRaw)))
  }

  const unitPriceCents = Math.max(0, Math.floor(item.unitPriceCents))
  const qty = Math.max(0, Math.floor(item.qty))
  const lineTotalCents = Math.max(0, Math.floor(item.lineTotalCents))
  const fullLineCents = unitPriceCents * qty
  const reductionCents = fullLineCents - lineTotalCents

  if (unitPriceCents <= 0 || reductionCents <= 0) return 0
  if (reductionCents % unitPriceCents !== 0) return 0

  const inferredQty = reductionCents / unitPriceCents
  if (!Number.isInteger(inferredQty) || inferredQty <= 0) return 0
  return Math.min(qty, inferredQty)
}

function normalizeDiscountCents(sale: Sale, saleItems: SaleItem[]): number {
  const raw = Number(sale.discountCents ?? 0)
  if (Number.isFinite(raw) && raw > 0) return Math.max(0, Math.floor(raw))

  const itemsTotalCents = saleItems.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(item.lineTotalCents)),
    0
  )
  return Math.max(0, itemsTotalCents - Math.max(0, Math.floor(sale.totalCents)))
}

function getBonusSummary(saleItems: SaleItem[]): {
  bonusItemsCount: number
  bonusItemsValueCents: number
} {
  return saleItems.reduce(
    (acc, item) => {
      const bonusQty = normalizeBonusQty(item)
      if (bonusQty <= 0) return acc
      acc.bonusItemsCount += bonusQty
      acc.bonusItemsValueCents += item.unitPriceCents * bonusQty
      return acc
    },
    { bonusItemsCount: 0, bonusItemsValueCents: 0 }
  )
}

function buildItemRows(saleItems: SaleItem[]): string {
  return saleItems
    .map((item) => {
      const name = escapeHtml(item.productName)
      const sku = item.sku ? `<div class="meta">SKU: ${escapeHtml(item.sku)}</div>` : ""
      const bonusQty = normalizeBonusQty(item)
      const bonusMeta =
        bonusQty > 0
          ? `<div class="meta">BONUS: ${bonusQty} un. (-${formatCurrency(
              item.unitPriceCents * bonusQty
            )})</div>`
          : ""
      return `
        <div class="row">
          <div class="line1">${item.qty}x ${name}</div>
          ${sku}
          ${bonusMeta}
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
  options: BuildReceiptHtmlOptions,
  customContent: ReceiptCustomContent
): string {
  const { sale, saleItems, operatorName, storeName } = input
  const title = storeName?.trim() || "CaixaTotal"
  const customerName = sale.customerName?.trim() || "-"
  const customerPhone = sale.customerPhone?.trim() || "-"
  const operator = operatorName?.trim() || "-"
  const discountCents = normalizeDiscountCents(sale, saleItems)
  const subtotalCents = sale.totalCents + discountCents
  const { bonusItemsCount, bonusItemsValueCents } = getBonusSummary(saleItems)
  const safeTitle = escapeHtml(title)
  const copyLabel = RECEIPT_COPY_LABELS[options.copyType]
  const headerBlock =
    customContent.headerLines.length > 0
      ? `<div class="center small custom-text">${customContent.headerLines
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join("")}</div>`
      : ""
  const footerBlock =
    customContent.footerLines.length > 0
      ? `<div class="center small custom-text">${customContent.footerLines
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join("")}</div>`
      : ""
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
          .custom-text { margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">${safeTitle}</div>
          <div>COMPROVANTE DE VENDA</div>
          <div class="small">${copyLabel}</div>
        </div>
        ${headerBlock}

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

        ${
          bonusItemsCount > 0
            ? `<div class="line2 small"><span>Bonus concedido (${bonusItemsCount} un.)</span><span>-${formatCurrency(
                bonusItemsValueCents
              )}</span></div>`
            : ""
        }
        ${
          discountCents > 0
            ? `<div class="line2 small"><span>Subtotal</span><span>${formatCurrency(
                subtotalCents
              )}</span></div>`
            : ""
        }
        ${
          discountCents > 0
            ? `<div class="line2 small"><span>Desconto no total</span><span>-${formatCurrency(
                discountCents
              )}</span></div>`
            : ""
        }

        <div class="line2 totals">
          <span>Total</span>
          <span>${formatCurrency(sale.totalCents)}</span>
        </div>
        <div class="line2 small">
          <span>Qtd. itens</span>
          <span>${sale.itemsCount}</span>
        </div>

        <div class="divider"></div>

        ${footerBlock}
        <div class="center small">Obrigado pela preferencia!</div>

        ${printScript}
      </body>
    </html>
  `
}

function buildReceiptText(
  input: PrintSaleReceiptInput,
  customContent: ReceiptCustomContent,
  copyType: ReceiptCopyType
): string {
  const { sale, saleItems, operatorName, storeName } = input
  const title = sanitizeText(storeName?.trim() || "CaixaTotal")
  const customerName = sanitizeText(sale.customerName?.trim() || "-")
  const customerPhone = sanitizeText(sale.customerPhone?.trim() || "-")
  const operator = sanitizeText(operatorName?.trim() || "-")
  const dateTime = sanitizeText(formatDateTime(sale.createdAt))
  const saleId = sanitizeText(sale.id)
  const discountCents = normalizeDiscountCents(sale, saleItems)
  const subtotalCents = sale.totalCents + discountCents
  const { bonusItemsCount, bonusItemsValueCents } = getBonusSummary(saleItems)
  const divider = "-".repeat(RECEIPT_WIDTH)
  const copyLabel = RECEIPT_COPY_LABELS[copyType]

  const lines: string[] = []
  lines.push(centerText(title, RECEIPT_WIDTH))
  lines.push(centerText("COMPROVANTE DE VENDA", RECEIPT_WIDTH))
  lines.push(centerText(copyLabel, RECEIPT_WIDTH))
  for (const headerLine of customContent.headerLines) {
    for (const wrapped of wrapText(headerLine, RECEIPT_WIDTH)) {
      lines.push(centerText(wrapped, RECEIPT_WIDTH))
    }
  }
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
    const bonusQty = normalizeBonusQty(item)
    if (bonusQty > 0) {
      lines.push(
        `BONUS: ${bonusQty} un. (-${formatCurrency(item.unitPriceCents * bonusQty)})`
      )
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
  if (bonusItemsCount > 0) {
    lines.push(
      buildPairLine(
        `BONUS (${bonusItemsCount} un.)`,
        `-${formatCurrency(bonusItemsValueCents)}`,
        RECEIPT_WIDTH
      )
    )
  }
  if (discountCents > 0) {
    lines.push(buildPairLine("SUBTOTAL", formatCurrency(subtotalCents), RECEIPT_WIDTH))
    lines.push(
      buildPairLine("DESC. TOTAL", `-${formatCurrency(discountCents)}`, RECEIPT_WIDTH)
    )
  }
  lines.push(buildPairLine("TOTAL", formatCurrency(sale.totalCents), RECEIPT_WIDTH))
  lines.push(buildPairLine("QTD. ITENS", String(sale.itemsCount), RECEIPT_WIDTH))
  lines.push(divider)
  for (const footerLine of customContent.footerLines) {
    for (const wrapped of wrapText(footerLine, RECEIPT_WIDTH)) {
      lines.push(centerText(wrapped, RECEIPT_WIDTH))
    }
  }
  lines.push(centerText("Obrigado pela preferencia!", RECEIPT_WIDTH))
  lines.push("")
  lines.push("")
  lines.push("")

  return lines.join("\n")
}

async function tryDesktopTextSilentPrint(
  text: string,
  printerSettings: PrinterSettings
): Promise<PrintSaleReceiptResult | null> {
  if (typeof window === "undefined") return null
  if (!window.caixaDesktop?.printTextSilently) return null

  const printOptions = {
    connectionType: printerSettings.connectionType,
    localPrinterName: printerSettings.localPrinterName || undefined,
    wifiHost: printerSettings.wifiHost || undefined,
    wifiPort: printerSettings.wifiPort || undefined,
    cutAfterPrint: printerSettings.cutAfterEachCopy,
  }

  try {
    const result = await window.caixaDesktop.printTextSilently(text, printOptions)
    return {
      ok: Boolean(result?.ok),
      mode: "desktop-silent-text",
      printedCopies: [],
      error: result?.error,
    }
  } catch (error) {
    return {
      ok: false,
      mode: "desktop-silent-text",
      printedCopies: [],
      error: error instanceof Error ? error.message : "Falha na impressao silenciosa",
    }
  }
}

function openBrowserPrintDialog(html: string): PrintSaleReceiptResult {
  if (typeof window === "undefined") {
    return {
      ok: false,
      mode: "browser-dialog",
      printedCopies: [],
      error: "Ambiente sem janela de navegador",
    }
  }
  const printWindow = window.open("", "_blank", "width=480,height=760")
  if (!printWindow) {
    return {
      ok: false,
      mode: "browser-dialog",
      printedCopies: [],
      error: "Nao foi possivel abrir a janela de impressao",
    }
  }

  printWindow.document.write(html)
  printWindow.document.close()
  return { ok: true, mode: "browser-dialog", printedCopies: [] }
}

function isLikelyElectronRuntime(): boolean {
  if (typeof navigator === "undefined") return false
  return navigator.userAgent.toLowerCase().includes("electron")
}

function uniqueReceiptCopies(copies: ReceiptCopyType[]): ReceiptCopyType[] {
  return copies.filter((copy, index) => copies.indexOf(copy) === index)
}

function resolveReceiptCopies(
  input: PrintSaleReceiptInput,
  printerSettings: PrinterSettings
): ReceiptCopyType[] {
  if (input.copies && input.copies.length > 0) {
    return uniqueReceiptCopies(input.copies)
  }

  if (input.respectAutoPrint) {
    if (!printerSettings.autoPrintEnabled) return []

    const automaticCopies: ReceiptCopyType[] = []
    if (printerSettings.printSellerCopy) automaticCopies.push("seller")
    if (printerSettings.printCustomerCopy) automaticCopies.push("customer")
    return automaticCopies
  }

  return ["seller"]
}

function formatCopyError(copyType: ReceiptCopyType, error: string | undefined): string {
  const baseMessage = error || "Nao foi possivel imprimir o comprovante"
  return `Falha ao imprimir ${RECEIPT_COPY_LABELS[copyType].toLowerCase()}: ${baseMessage}`
}

export async function printSaleReceipt(
  input: PrintSaleReceiptInput
): Promise<PrintSaleReceiptResult> {
  const printerSettings = getPrinterSettings()
  const copies = resolveReceiptCopies(input, printerSettings)
  if (copies.length === 0) {
    return {
      ok: true,
      mode: "skipped",
      printedCopies: [],
      skipped: true,
    }
  }

  const customContent = buildReceiptCustomContent(printerSettings)

  const printedCopies: ReceiptCopyType[] = []
  let lastMode: PrintSaleReceiptResult["mode"] = "desktop-silent-text"

  for (const copyType of copies) {
    const desktopText = buildReceiptText(input, customContent, copyType)
    const browserHtml = buildReceiptHtml(
      input,
      { includePrintScript: true, copyType },
      customContent
    )
    const desktopResult = await tryDesktopTextSilentPrint(desktopText, printerSettings)
    if (desktopResult) {
      lastMode = desktopResult.mode
      if (!desktopResult.ok) {
        return {
          ...desktopResult,
          printedCopies,
          error: formatCopyError(copyType, desktopResult.error),
        }
      }
      printedCopies.push(copyType)
      continue
    }

    if (isLikelyElectronRuntime()) {
      return {
        ok: false,
        mode: "desktop-silent-text",
        printedCopies,
        error:
          "Integracao de impressao em texto indisponivel. Reinicie o app desktop para carregar a bridge.",
      }
    }

    const browserResult = openBrowserPrintDialog(browserHtml)
    lastMode = browserResult.mode
    if (!browserResult.ok) {
      return {
        ...browserResult,
        printedCopies,
        error: formatCopyError(copyType, browserResult.error),
      }
    }
    printedCopies.push(copyType)
  }

  return {
    ok: true,
    mode: lastMode,
    printedCopies,
  }
}
