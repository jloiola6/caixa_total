"use client"

import { useState } from "react"
import { CloudOff, Download, Loader2, RefreshCw, Server, HardDrive } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getSyncState, type ServerSyncState } from "@/lib/api"
import { getStoredStoreId } from "@/lib/auth-api"
import { computeConflicts, applyServerState, type ConflictItem } from "@/lib/sync-conflict"
import { toast } from "sonner"
import * as XLSX from "xlsx"

const ENTITY_LABELS: Record<ConflictItem["entity"], string> = {
  products: "Produtos",
  sales: "Vendas",
  sale_items: "Itens de venda",
  sale_payments: "Pagamentos",
  stock_logs: "Mov. estoque",
}

export function SyncModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<"confirm" | "checking" | "result" | "syncing">("confirm")
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [serverState, setServerState] = useState<ServerSyncState | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckConflicts() {
    setError(null)
    setStep("checking")
    try {
      const storeId = getStoredStoreId() ?? undefined
      const server = await getSyncState(storeId)
      setServerState(server)
      const list = await computeConflicts(server)
      setConflicts(list)
      setStep("result")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep("confirm")
      toast.error("Não foi possível conectar ao servidor. Verifique a URL e se o back está rodando.")
    }
  }

  async function handlePriorizarServidor() {
    if (!serverState) return
    setStep("syncing")
    try {
      await applyServerState(serverState)
      toast.success("Dados do servidor aplicados localmente.")
      onOpenChange(false)
      reset()
      window.dispatchEvent(new Event("storage"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStep("result")
    }
  }

  async function handlePriorizarLocal() {
    setStep("syncing")
    try {
      const { syncToServer } = await import("@/lib/sync")
      const result = await syncToServer()
      if (result.ok) {
        toast.success("Dados locais enviados ao servidor.")
        onOpenChange(false)
        reset()
        window.dispatchEvent(new Event("notifications:updated"))
      } else {
        toast.error(result.error ?? "Falha ao sincronizar")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStep("result")
    }
  }

  async function handleSyncNoConflicts() {
    setStep("syncing")
    try {
      const { syncToServer } = await import("@/lib/sync")
      const result = await syncToServer()
      if (result.ok) {
        toast.success("Sincronização concluída.")
        onOpenChange(false)
        reset()
        window.dispatchEvent(new Event("notifications:updated"))
      } else {
        toast.error(result.error ?? "Falha ao sincronizar")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setStep("result")
    }
  }

  function exportToExcel() {
    if (conflicts.length === 0) return
    const rows = conflicts.map((c) => ({
      Entidade: ENTITY_LABELS[c.entity],
      ID: c.id,
      Resumo: c.label,
      "Alterado (local)": c.localUpdated?.slice(0, 19) ?? "",
      "Alterado (servidor)": c.serverUpdated?.slice(0, 19) ?? "",
      "Preview local": c.localPreview,
      "Preview servidor": c.serverPreview,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Conflitos")
    XLSX.writeFile(wb, "conflitos-sincronizacao.xlsx")
    toast.success("Arquivo exportado.")
  }

  function reset() {
    setStep("confirm")
    setConflicts([])
    setServerState(null)
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-5" />
            Sincronização
          </DialogTitle>
          <DialogDescription>
            {step === "confirm" &&
              "Verifique conflitos entre seus dados locais e o servidor antes de sincronizar."}
            {step === "checking" && "Verificando conflitos..."}
            {step === "result" &&
              conflicts.length === 0 &&
              "Nenhum conflito. Você pode enviar seus dados locais ao servidor."}
            {step === "result" &&
              conflicts.length > 0 &&
              `${conflicts.length} conflito(s) encontrado(s). Escolha qual versão priorizar.`}
            {step === "syncing" && "Sincronizando..."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3 flex items-center gap-2">
            <CloudOff className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "confirm" && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCheckConflicts}>
              Verificar conflitos
            </Button>
          </DialogFooter>
        )}

        {step === "checking" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "result" && conflicts.length === 0 && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
            <Button onClick={handleSyncNoConflicts}>
              Sincronizar (enviar local → servidor)
            </Button>
          </DialogFooter>
        )}

        {step === "result" && conflicts.length > 0 && (
          <>
            <div className="overflow-auto flex-1 min-h-0 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Resumo</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Servidor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.map((c) => (
                    <TableRow key={`${c.entity}-${c.id}`}>
                      <TableCell className="font-medium">{ENTITY_LABELS[c.entity]}</TableCell>
                      <TableCell className="max-w-[120px] truncate" title={c.label}>{c.label}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate" title={c.localPreview}>{c.localPreview}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate" title={c.serverPreview}>{c.serverPreview}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <Download className="size-4 mr-1" />
                Exportar diferenças (Excel)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePriorizarServidor}
                disabled={step === "syncing"}
              >
                <Server className="size-4 mr-1" />
                Priorizar servidor
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePriorizarLocal}
                disabled={step === "syncing"}
              >
                <HardDrive className="size-4 mr-1" />
                Priorizar local
              </Button>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              {step === "syncing" && (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              )}
            </DialogFooter>
          </>
        )}

        {step === "syncing" && conflicts.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
