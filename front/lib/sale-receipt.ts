import type { Sale, SaleItem } from "@/lib/types"
import { PAYMENT_METHOD_LABELS } from "@/lib/types"

type PrintSaleReceiptInput = {
  sale: Sale
  saleItems: SaleItem[]
  operatorName?: string | null
  storeName?: string | null
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

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

function buildReceiptHtml(input: PrintSaleReceiptInput): string {
  const { sale, saleItems, operatorName, storeName } = input
  const title = storeName?.trim() || "CaixaTotal"
  const customerName = sale.customerName?.trim() || "-"
  const customerPhone = sale.customerPhone?.trim() || "-"
  const operator = operatorName?.trim() || "-"
  const safeTitle = escapeHtml(title)

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

        <script>
          window.onload = function () {
            setTimeout(function () {
              window.focus();
              window.print();
              setTimeout(function () { window.close(); }, 300);
            }, 80);
          };
        </script>
      </body>
    </html>
  `
}

export function printSaleReceipt(input: PrintSaleReceiptInput): boolean {
  if (typeof window === "undefined") return false

  const printWindow = window.open("", "_blank", "width=480,height=760")
  if (!printWindow) return false

  printWindow.document.write(buildReceiptHtml(input))
  printWindow.document.close()
  return true
}
