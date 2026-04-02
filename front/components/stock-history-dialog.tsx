"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getStockLogs } from "@/lib/db"
import { formatDate } from "@/lib/format"
import type { Product } from "@/lib/types"

interface StockHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
}

function formatLogDateSafe(value: string): string {
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

export function StockHistoryDialog({
  open,
  onOpenChange,
  product,
}: StockHistoryDialogProps) {
  const [selectedReason, setSelectedReason] = useState<{
    itemLabel: string
    reason: string
  } | null>(null)

  const logs = useMemo(
    () => (product ? getStockLogs(product.id) : []),
    [product, open]
  )

  function handleMainOpenChange(isOpen: boolean) {
    if (!isOpen) setSelectedReason(null)
    onOpenChange(isOpen)
  }

  if (!product) return null

  return (
    <Dialog open={open} onOpenChange={handleMainOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historico de estoque</DialogTitle>
          <DialogDescription>
            {product.name} · {logs.length} movimentacao(oes)
          </DialogDescription>
        </DialogHeader>

        {logs.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma movimentacao de estoque registrada para este produto.
          </div>
        ) : (
          <ScrollArea className="max-h-[420px] pr-4">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Movimento</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="w-[36%]">Justificativa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const isEntry = log.delta > 0
                  const reasonText = log.reason?.trim() || "-"
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatLogDateSafe(log.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={log.productName}>
                        {log.productName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            isEntry
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                          }
                        >
                          {isEntry ? "Entrada" : "Saida"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${isEntry ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                      >
                        {isEntry ? `+${log.delta}` : log.delta}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate text-muted-foreground"
                            title={reasonText}
                          >
                            {reasonText}
                          </span>
                          {log.reason && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 px-2"
                              onClick={() =>
                                setSelectedReason({
                                  itemLabel: log.productName,
                                  reason: reasonText,
                                })
                              }
                            >
                              Ver
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>

      <Dialog
        open={!!selectedReason}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedReason(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Justificativa completa</DialogTitle>
            <DialogDescription>{selectedReason?.itemLabel}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {selectedReason?.reason}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
