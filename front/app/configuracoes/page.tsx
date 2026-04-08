"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Save, Printer, Wifi, Cable, TestTube2, CloudOff, ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/contexts/auth-context"
import { getStores, updateStore, type Store } from "@/lib/admin-api"
import type { Sale, SaleItem } from "@/lib/types"
import { getDefaultPrinterSettings, getPrinterSettings, savePrinterSettings } from "@/lib/printer-settings"
import { printSaleReceipt } from "@/lib/sale-receipt"
import { setOfflineModeEnabledForStore } from "@/lib/offline-mode"
import { toast } from "sonner"

type InstalledPrinter = {
  name: string
  isDefault: boolean
}

export default function ConfiguracoesPage() {
  const { user } = useAuth()

  const [enabled, setEnabled] = useState(false)
  const [connectionType, setConnectionType] = useState<"local" | "wifi">("local")
  const [localPrinterName, setLocalPrinterName] = useState("")
  const [wifiHost, setWifiHost] = useState("")
  const [wifiPort, setWifiPort] = useState("9100")

  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [installedPrinters, setInstalledPrinters] = useState<InstalledPrinter[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storesSaving, setStoresSaving] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [storeOfflineModeEnabled, setStoreOfflineModeEnabled] = useState(true)
  const [storeOnlineEnabled, setStoreOnlineEnabled] = useState(false)

  const isDesktop = typeof window !== "undefined" && Boolean(window.caixaDesktop)
  const isSuperAdmin = user?.role === "SUPER_ADMIN"

  useEffect(() => {
    const settings = getPrinterSettings()
    setEnabled(settings.enabled)
    setConnectionType(settings.connectionType)
    setLocalPrinterName(settings.localPrinterName)
    setWifiHost(settings.wifiHost)
    setWifiPort(String(settings.wifiPort || 9100))
  }, [])

  async function loadInstalledPrinters() {
    if (!window.caixaDesktop?.listPrinters) {
      setInstalledPrinters([])
      return
    }

    setLoadingPrinters(true)
    try {
      const response = await window.caixaDesktop.listPrinters()
      if (!response.ok) {
        toast.error(response.error || "Falha ao listar impressoras locais")
        setInstalledPrinters([])
        return
      }
      const printers = response.printers ?? []
      setInstalledPrinters(printers)
      if (!localPrinterName.trim()) {
        const preferred = printers.find((printer) => printer.isDefault) ?? printers[0]
        if (preferred?.name) setLocalPrinterName(preferred.name)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao listar impressoras")
      setInstalledPrinters([])
    } finally {
      setLoadingPrinters(false)
    }
  }

  useEffect(() => {
    if (!isDesktop) return
    void loadInstalledPrinters()
  }, [isDesktop])

  useEffect(() => {
    if (!isSuperAdmin) return
    setStoresLoading(true)
    getStores()
      .then((list) => {
        setStores(list)
        setSelectedStoreId((current) => current || list[0]?.id || "")
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar lojas")
      })
      .finally(() => setStoresLoading(false))
  }, [isSuperAdmin])

  const selectedStore = useMemo(() => {
    return stores.find((store) => store.id === selectedStoreId) ?? null
  }, [stores, selectedStoreId])

  useEffect(() => {
    if (!selectedStore) return
    setStoreOfflineModeEnabled(Boolean(selectedStore.offlineModeEnabled))
    setStoreOnlineEnabled(Boolean(selectedStore.onlineStoreEnabled))
  }, [selectedStore])

  const validationError = useMemo(() => {
    if (!enabled) return null
    if (connectionType === "local") {
      if (!localPrinterName.trim()) {
        return "Selecione uma impressora local para continuar."
      }
      return null
    }
    if (!wifiHost.trim()) {
      return "Informe o IP/host da impressora Wi-Fi."
    }
    const port = Number(wifiPort)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return "Informe uma porta valida (1-65535)."
    }
    return null
  }, [enabled, connectionType, localPrinterName, wifiHost, wifiPort])

  function persistSettings() {
    if (validationError) {
      toast.error(validationError)
      return null
    }

    const defaults = getDefaultPrinterSettings()
    const saved = savePrinterSettings({
      ...defaults,
      enabled,
      connectionType,
      localPrinterName: localPrinterName.trim(),
      wifiHost: wifiHost.trim(),
      wifiPort: Math.max(1, Math.floor(Number(wifiPort) || 9100)),
      updatedAt: defaults.updatedAt,
    })
    return saved
  }

  function handleSave() {
    const saved = persistSettings()
    if (!saved) return
    toast.success("Configuracoes de impressora salvas")
  }

  async function handleTestPrint() {
    const saved = persistSettings()
    if (!saved) return

    const now = new Date().toISOString()
    const sale: Sale = {
      id: `TESTE-${Date.now()}`,
      createdAt: now,
      totalCents: 7990,
      itemsCount: 2,
      payments: [{ method: "pix", amountCents: 7990 }],
      customerName: "Cliente Teste",
      customerPhone: null,
    }
    const saleItems: SaleItem[] = [
      {
        id: `item-1-${Date.now()}`,
        saleId: sale.id,
        productId: "teste-1",
        productName: "Produto de teste",
        sku: "TESTE-001",
        qty: 1,
        unitPriceCents: 4990,
        lineTotalCents: 4990,
      },
      {
        id: `item-2-${Date.now()}`,
        saleId: sale.id,
        productId: "teste-2",
        productName: "Produto de exemplo",
        sku: "TESTE-002",
        qty: 1,
        unitPriceCents: 3000,
        lineTotalCents: 3000,
      },
    ]

    const result = await printSaleReceipt({
      sale,
      saleItems,
      operatorName: user?.name ?? "Operador",
      storeName: user?.store?.name ?? "CaixaTotal",
    })
    if (result.ok) {
      toast.success("Teste de impressao enviado")
      return
    }
    toast.error(result.error || "Falha ao enviar teste de impressao")
  }

  async function handleSaveStoreSettings() {
    if (!selectedStoreId) {
      toast.error("Selecione uma loja para continuar")
      return
    }

    setStoresSaving(true)
    try {
      const updatedStore = await updateStore(selectedStoreId, {
        offlineModeEnabled: storeOfflineModeEnabled,
        onlineStoreEnabled: storeOnlineEnabled,
      })
      setStores((prev) => prev.map((store) => (store.id === updatedStore.id ? updatedStore : store)))
      setOfflineModeEnabledForStore(updatedStore.id, updatedStore.offlineModeEnabled)
      toast.success("Configuracoes da loja salvas")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar configuracao")
    } finally {
      setStoresSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Defina as politicas de operacao por loja."
            : "Defina como os comprovantes de venda devem ser impressos."}
        </p>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudOff className="size-5" />
              Configuracoes por Loja
            </CardTitle>
            <CardDescription>
              Ajuste politicas de operacao e habilite a loja online publica por slug.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Loja</Label>
              <Select
                value={selectedStoreId || undefined}
                onValueChange={setSelectedStoreId}
                disabled={storesLoading || stores.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={storesLoading ? "Carregando lojas..." : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name} ({store.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="offline-enabled">Permitir modo offline</Label>
                <p className="text-xs text-muted-foreground">
                  Se desligar, a loja precisa de conexao com API para gravar dados.
                </p>
              </div>
              <Switch
                id="offline-enabled"
                checked={storeOfflineModeEnabled}
                onCheckedChange={setStoreOfflineModeEnabled}
                disabled={!selectedStoreId || storesLoading}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="online-store-enabled">Loja online publica</Label>
                <p className="text-xs text-muted-foreground">
                  Libera consulta publica de produtos e estoque em /loja?slug={selectedStore?.slug || "..."}.
                </p>
              </div>
              <Switch
                id="online-store-enabled"
                checked={storeOnlineEnabled}
                onCheckedChange={setStoreOnlineEnabled}
                disabled={!selectedStoreId || storesLoading}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleSaveStoreSettings()}
                className="gap-2"
                disabled={!selectedStoreId || storesLoading || storesSaving}
              >
                <Save className="size-4" />
                {storesSaving ? "Salvando..." : "Salvar configuracao"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!selectedStore || !storeOnlineEnabled}
                onClick={() => {
                  if (!selectedStore) return
                  const query = encodeURIComponent(selectedStore.slug)
                  window.open(`/loja?slug=${query}`, "_blank", "noopener,noreferrer")
                }}
              >
                <ExternalLink className="size-4" />
                Abrir loja online
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isSuperAdmin && (
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-5" />
            Impressora
          </CardTitle>
          <CardDescription>
            Configure impressora conectada localmente ou impressora de rede Wi-Fi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="printer-enabled">Impressao automatica de comprovantes</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativa, toda venda finalizada dispara impressao automaticamente.
              </p>
            </div>
            <Switch
              id="printer-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de conexao</Label>
              <Select
                value={connectionType}
                onValueChange={(value) => setConnectionType(value as "local" | "wifi")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">
                    <span className="inline-flex items-center gap-2">
                      <Cable className="size-4" />
                      Conectada (USB/local)
                    </span>
                  </SelectItem>
                  <SelectItem value="wifi">
                    <span className="inline-flex items-center gap-2">
                      <Wifi className="size-4" />
                      Wi-Fi (rede)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {connectionType === "local" && isDesktop && (
              <div className="space-y-1.5">
                <Label>Impressora detectada</Label>
                <div className="flex gap-2">
                  <Select
                    value={localPrinterName || undefined}
                    onValueChange={setLocalPrinterName}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {installedPrinters.length === 0 ? (
                        <SelectItem value="__empty__" disabled>
                          Nenhuma impressora detectada
                        </SelectItem>
                      ) : (
                        installedPrinters.map((printer) => (
                          <SelectItem key={printer.name} value={printer.name}>
                            {printer.name}
                            {printer.isDefault ? " (padrao)" : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void loadInstalledPrinters()}
                    disabled={loadingPrinters}
                    title="Atualizar lista de impressoras"
                  >
                    <RefreshCw className={`size-4 ${loadingPrinters ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {connectionType === "local" && (
            <div className="space-y-1.5">
              <Label htmlFor="printer-local-name">Nome da impressora local</Label>
              <Input
                id="printer-local-name"
                value={localPrinterName}
                onChange={(event) => setLocalPrinterName(event.target.value)}
                placeholder="Ex.: IDPRINT"
              />
              <p className="text-xs text-muted-foreground">
                Em desktop, use o nome exato da fila CUPS. Exemplo: IDPRINT.
              </p>
            </div>
          )}

          {connectionType === "wifi" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="printer-wifi-host">IP/Host da impressora</Label>
                <Input
                  id="printer-wifi-host"
                  value={wifiHost}
                  onChange={(event) => setWifiHost(event.target.value)}
                  placeholder="Ex.: 192.168.0.55"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="printer-wifi-port">Porta TCP</Label>
                <Input
                  id="printer-wifi-port"
                  value={wifiPort}
                  onChange={(event) => setWifiPort(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="9100"
                />
              </div>
            </div>
          )}

          {validationError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {validationError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} className="gap-2">
              <Save className="size-4" />
              Salvar configuracoes
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleTestPrint()} className="gap-2">
              <TestTube2 className="size-4" />
              Testar impressao
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
