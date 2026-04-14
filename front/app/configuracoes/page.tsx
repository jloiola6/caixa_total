"use client"

import { useEffect, useMemo, useState } from "react"
import {
  RefreshCw,
  Save,
  Printer,
  Wifi,
  Cable,
  TestTube2,
  CloudOff,
  ExternalLink,
  Smartphone,
  Store,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import {
  MOBILE_MENU_SHORTCUT_LIMIT,
  getStoreUserNavItems,
  resolveMobileMenuShortcuts,
  sanitizeMobileMenuShortcuts,
} from "@/components/app-navigation"
import { getStores, updateStore, type Store as AdminStore } from "@/lib/admin-api"
import { updateMyStoreSettings } from "@/lib/auth-api"
import type { Sale, SaleItem } from "@/lib/types"
import { getDefaultPrinterSettings, getPrinterSettings, savePrinterSettings } from "@/lib/printer-settings"
import { printSaleReceipt } from "@/lib/sale-receipt"
import { setOfflineModeEnabledForStore } from "@/lib/offline-mode"
import {
  DEFAULT_STOCK_ALERT_COLORS,
  DEFAULT_STOCK_ALERT_THRESHOLDS,
  normalizeHexColor,
  resolveStockAlertThresholds,
} from "@/lib/store-settings"
import { toast } from "sonner"

type InstalledPrinter = {
  name: string
  isDefault: boolean
}

function parseThresholdInput(value: string): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  const normalized = Math.floor(numeric)
  if (normalized < 0) return null
  if (normalized > 1000000) return null
  return normalized
}

export default function ConfiguracoesPage() {
  const { user, applyStoreSettings, refreshUser } = useAuth()

  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  const [connectionType, setConnectionType] = useState<"local" | "wifi">("local")
  const [localPrinterName, setLocalPrinterName] = useState("")
  const [wifiHost, setWifiHost] = useState("")
  const [wifiPort, setWifiPort] = useState("9100")
  const [printSellerCopy, setPrintSellerCopy] = useState(true)
  const [printCustomerCopy, setPrintCustomerCopy] = useState(true)
  const [cutAfterEachCopy, setCutAfterEachCopy] = useState(true)
  const [headerText, setHeaderText] = useState("")
  const [footerText, setFooterText] = useState("")

  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [installedPrinters, setInstalledPrinters] = useState<InstalledPrinter[]>([])

  const [stores, setStores] = useState<AdminStore[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storesSaving, setStoresSaving] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [storeOfflineModeEnabled, setStoreOfflineModeEnabled] = useState(true)
  const [storeOnlineEnabled, setStoreOnlineEnabled] = useState(false)
  const [storeFinanceModuleEnabled, setStoreFinanceModuleEnabled] = useState(true)

  const [myStoreSaving, setMyStoreSaving] = useState(false)
  const [myStoreWhatsappNumber, setMyStoreWhatsappNumber] = useState("")
  const [myStoreWhatsappMessage, setMyStoreWhatsappMessage] = useState("")
  const [myMobileMenuShortcuts, setMyMobileMenuShortcuts] = useState<string[]>([])
  const [myStockAlertLowColor, setMyStockAlertLowColor] = useState(DEFAULT_STOCK_ALERT_COLORS.lowStock)
  const [myStockAlertOutColor, setMyStockAlertOutColor] = useState(DEFAULT_STOCK_ALERT_COLORS.outOfStock)
  const [myStockAlertOkColor, setMyStockAlertOkColor] = useState(DEFAULT_STOCK_ALERT_COLORS.inStock)
  const [myStockAlertLowThreshold, setMyStockAlertLowThreshold] = useState(
    String(DEFAULT_STOCK_ALERT_THRESHOLDS.lowStock)
  )
  const [myStockAlertAvailableThreshold, setMyStockAlertAvailableThreshold] = useState(
    String(DEFAULT_STOCK_ALERT_THRESHOLDS.inStock)
  )

  const isDesktop = typeof window !== "undefined" && Boolean(window.caixaDesktop)
  const isSuperAdmin = user?.role === "SUPER_ADMIN"
  const storeMobileNavItems = useMemo(
    () => getStoreUserNavItems(user?.store?.financeModuleEnabled !== false),
    [user?.store?.financeModuleEnabled]
  )

  useEffect(() => {
    const settings = getPrinterSettings()
    setAutoPrintEnabled(settings.autoPrintEnabled)
    setConnectionType(settings.connectionType)
    setLocalPrinterName(settings.localPrinterName)
    setWifiHost(settings.wifiHost)
    setWifiPort(String(settings.wifiPort || 9100))
    setPrintSellerCopy(settings.printSellerCopy)
    setPrintCustomerCopy(settings.printCustomerCopy)
    setCutAfterEachCopy(settings.cutAfterEachCopy)
    setHeaderText(settings.headerText || "")
    setFooterText(settings.footerText || "")
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
    setStoreFinanceModuleEnabled(selectedStore.financeModuleEnabled !== false)
  }, [selectedStore])

  useEffect(() => {
    if (isSuperAdmin) return
    const store = user?.store
    if (!store) return

    const thresholds = resolveStockAlertThresholds({
      stockAlertLowThreshold: store.stockAlertLowThreshold ?? null,
      stockAlertAvailableThreshold: store.stockAlertAvailableThreshold ?? null,
    })

    setMyStoreWhatsappNumber(store.onlineStoreWhatsappNumber ?? "")
    setMyStoreWhatsappMessage(store.onlineStoreWhatsappMessage ?? "")
    setMyMobileMenuShortcuts(
      resolveMobileMenuShortcuts(store.mobileMenuShortcuts, storeMobileNavItems)
    )
    setMyStockAlertLowColor(
      normalizeHexColor(store.stockAlertLowColor, DEFAULT_STOCK_ALERT_COLORS.lowStock)
    )
    setMyStockAlertOutColor(
      normalizeHexColor(store.stockAlertOutColor, DEFAULT_STOCK_ALERT_COLORS.outOfStock)
    )
    setMyStockAlertOkColor(
      normalizeHexColor(store.stockAlertOkColor, DEFAULT_STOCK_ALERT_COLORS.inStock)
    )
    setMyStockAlertLowThreshold(String(thresholds.lowStock))
    setMyStockAlertAvailableThreshold(String(thresholds.inStock))
  }, [
    isSuperAdmin,
    user?.store?.onlineStoreWhatsappNumber,
    user?.store?.onlineStoreWhatsappMessage,
    user?.store?.mobileMenuShortcuts,
    user?.store?.stockAlertLowColor,
    user?.store?.stockAlertOutColor,
    user?.store?.stockAlertOkColor,
    user?.store?.stockAlertLowThreshold,
    user?.store?.stockAlertAvailableThreshold,
    storeMobileNavItems,
  ])

  const effectiveMobileMenuShortcuts = useMemo(
    () => resolveMobileMenuShortcuts(myMobileMenuShortcuts, storeMobileNavItems),
    [myMobileMenuShortcuts, storeMobileNavItems]
  )

  const effectiveMobileMenuItems = useMemo(() => {
    const selected = new Set(effectiveMobileMenuShortcuts)
    return storeMobileNavItems.filter((item) => selected.has(item.href))
  }, [effectiveMobileMenuShortcuts, storeMobileNavItems])

  const selectedStorefrontPath = useMemo(() => {
    if (!selectedStore) return ""
    return `/loja?slug=${encodeURIComponent(selectedStore.slug)}`
  }, [selectedStore])

  const myStorefrontPath = useMemo(() => {
    if (!user?.store?.slug) return ""
    return `/loja?slug=${encodeURIComponent(user.store.slug)}`
  }, [user?.store?.slug])

  const validationError = useMemo(() => {
    if (!autoPrintEnabled) return null
    if (!printSellerCopy && !printCustomerCopy) {
      return "Selecione ao menos uma via para a impressao automatica."
    }
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
  }, [
    autoPrintEnabled,
    connectionType,
    localPrinterName,
    printCustomerCopy,
    printSellerCopy,
    wifiHost,
    wifiPort,
  ])

  function persistSettings() {
    if (validationError) {
      toast.error(validationError)
      return null
    }

    const defaults = getDefaultPrinterSettings()
    const saved = savePrinterSettings({
      ...defaults,
      autoPrintEnabled,
      connectionType,
      localPrinterName: localPrinterName.trim(),
      wifiHost: wifiHost.trim(),
      wifiPort: Math.max(1, Math.floor(Number(wifiPort) || 9100)),
      printSellerCopy,
      printCustomerCopy,
      cutAfterEachCopy,
      headerText,
      footerText,
      updatedAt: defaults.updatedAt,
    })
    return saved
  }

  function handleSavePrinter() {
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
      copies:
        printSellerCopy || printCustomerCopy
          ? [
              ...(printSellerCopy ? ["seller" as const] : []),
              ...(printCustomerCopy ? ["customer" as const] : []),
            ]
          : ["seller"],
    })
    if (result.ok) {
      toast.success("Teste de impressao enviado")
      return
    }
    toast.error(result.error || "Falha ao enviar teste de impressao")
  }

  async function handleSaveStoreSettingsAsSuperAdmin() {
    if (!selectedStoreId) {
      toast.error("Selecione uma loja para continuar")
      return
    }

    setStoresSaving(true)
    try {
      const updatedStore = await updateStore(selectedStoreId, {
        offlineModeEnabled: storeOfflineModeEnabled,
        onlineStoreEnabled: storeOnlineEnabled,
        financeModuleEnabled: storeFinanceModuleEnabled,
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

  async function handleSaveMyStoreSettings() {
    const lowThreshold = parseThresholdInput(myStockAlertLowThreshold)
    const availableThreshold = parseThresholdInput(myStockAlertAvailableThreshold)
    const nextMobileMenuShortcuts = sanitizeMobileMenuShortcuts(
      myMobileMenuShortcuts,
      storeMobileNavItems
    )
    const nextStockAlertLowColor = normalizeHexColor(
      myStockAlertLowColor,
      DEFAULT_STOCK_ALERT_COLORS.lowStock
    )
    const nextStockAlertOutColor = normalizeHexColor(
      myStockAlertOutColor,
      DEFAULT_STOCK_ALERT_COLORS.outOfStock
    )
    const nextStockAlertOkColor = normalizeHexColor(
      myStockAlertOkColor,
      DEFAULT_STOCK_ALERT_COLORS.inStock
    )

    if (lowThreshold == null || availableThreshold == null) {
      toast.error("Informe limites válidos para estoque baixo e disponível")
      return
    }
    if (availableThreshold <= lowThreshold) {
      toast.error("O valor de estoque disponível precisa ser maior que o estoque baixo")
      return
    }

    setMyStoreSaving(true)
    try {
      const updatedStore = await updateMyStoreSettings({
        onlineStoreWhatsappNumber: myStoreWhatsappNumber.trim() || null,
        onlineStoreWhatsappMessage: myStoreWhatsappMessage.trim() || null,
        mobileMenuShortcuts: nextMobileMenuShortcuts,
        stockAlertLowColor: nextStockAlertLowColor,
        stockAlertOutColor: nextStockAlertOutColor,
        stockAlertOkColor: nextStockAlertOkColor,
        stockAlertLowThreshold: lowThreshold,
        stockAlertAvailableThreshold: availableThreshold,
      })
      if (user?.store) {
        applyStoreSettings({
          ...user.store,
          ...updatedStore,
          onlineStoreWhatsappNumber: myStoreWhatsappNumber.trim() || null,
          onlineStoreWhatsappMessage: myStoreWhatsappMessage.trim() || null,
          mobileMenuShortcuts: nextMobileMenuShortcuts,
          stockAlertLowColor: nextStockAlertLowColor,
          stockAlertOutColor: nextStockAlertOutColor,
          stockAlertOkColor: nextStockAlertOkColor,
          stockAlertLowThreshold: lowThreshold,
          stockAlertAvailableThreshold: availableThreshold,
        })
      } else {
        applyStoreSettings(updatedStore)
      }
      void refreshUser().catch((error) => {
        console.error("Falha ao atualizar dados da loja apos salvar:", error)
      })
      toast.success("Configuracoes da loja salvas")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar configuracao da loja")
    } finally {
      setMyStoreSaving(false)
    }
  }

  function toggleMobileMenuShortcut(href: string) {
    setMyMobileMenuShortcuts((current) => {
      if (current.includes(href)) {
        return current.filter((item) => item !== href)
      }

      const next = sanitizeMobileMenuShortcuts([...current, href], storeMobileNavItems)
      if (next.length === current.length) {
        toast.error(`Selecione ate ${MOBILE_MENU_SHORTCUT_LIMIT} atalhos fixos no mobile`)
        return current
      }

      return next
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuracoes</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Defina as politicas de operacao por loja."
            : "Defina as configuracoes da loja e como os comprovantes devem ser impressos."}
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

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="finance-module-enabled">Modulo financeiro</Label>
                <p className="text-xs text-muted-foreground">
                  Controla o acesso ao Financeiro para usuarios da loja.
                </p>
              </div>
              <Switch
                id="finance-module-enabled"
                checked={storeFinanceModuleEnabled}
                onCheckedChange={setStoreFinanceModuleEnabled}
                disabled={!selectedStoreId || storesLoading}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleSaveStoreSettingsAsSuperAdmin()}
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
                  if (!selectedStorefrontPath) return
                  window.open(selectedStorefrontPath, "_blank", "noopener,noreferrer")
                }}
              >
                <ExternalLink className="size-4" />
                Visualizar site online
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isSuperAdmin && user?.store && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="size-5" />
              Configuracoes da Loja
            </CardTitle>
            <CardDescription>
              Parametrize o atendimento da loja online e os alertas de estoque desta loja.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Contato da loja online</Label>
                <p className="text-xs text-muted-foreground">
                  Configure WhatsApp e mensagem padrao para solicitar itens da vitrine.
                </p>
                {!user.store.onlineStoreEnabled && (
                  <p className="text-xs text-amber-600">
                    A loja online está desativada. A ativação é feita apenas no super admin.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="my-store-online-whatsapp">WhatsApp da loja</Label>
                <Input
                  id="my-store-online-whatsapp"
                  value={myStoreWhatsappNumber}
                  onChange={(event) => setMyStoreWhatsappNumber(event.target.value)}
                  placeholder="Ex.: 5571999999999"
                  disabled={myStoreSaving}
                />
                <p className="text-xs text-muted-foreground">
                  Informe com DDI e DDD. Exemplo: 5571999999999.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="my-store-online-message">Mensagem padrao</Label>
                <Textarea
                  id="my-store-online-message"
                  value={myStoreWhatsappMessage}
                  onChange={(event) => setMyStoreWhatsappMessage(event.target.value)}
                  placeholder="Ola! Tenho interesse no produto {produto}. Pode me ajudar?"
                  rows={3}
                  disabled={myStoreSaving}
                />
                <p className="text-xs text-muted-foreground">
                  Marcadores aceitos: {"{produto}"}, {"{sku}"}, {"{preco}"}, {"{estoque}"}, {"{loja}"}.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="my-online-store-url">URL da loja online</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    id="my-online-store-url"
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={!myStorefrontPath || !user.store.onlineStoreEnabled}
                    onClick={() => {
                      if (!myStorefrontPath) return
                      window.open(myStorefrontPath, "_blank", "noopener,noreferrer")
                    }}
                  >
                    <ExternalLink className="size-4" />
                    Visualizar site online
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Alertas de estoque</Label>
                <p className="text-xs text-muted-foreground">
                  Defina as cores e os limites numéricos para estoque baixo e disponível.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="my-stock-alert-out-color">Sem estoque</Label>
                  <Input
                    id="my-stock-alert-out-color"
                    type="color"
                    value={myStockAlertOutColor}
                    onChange={(event) => setMyStockAlertOutColor(event.target.value)}
                    className="h-10 cursor-pointer p-1"
                    disabled={myStoreSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="my-stock-alert-low-color">Estoque baixo</Label>
                  <Input
                    id="my-stock-alert-low-color"
                    type="color"
                    value={myStockAlertLowColor}
                    onChange={(event) => setMyStockAlertLowColor(event.target.value)}
                    className="h-10 cursor-pointer p-1"
                    disabled={myStoreSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="my-stock-alert-ok-color">Estoque disponível</Label>
                  <Input
                    id="my-stock-alert-ok-color"
                    type="color"
                    value={myStockAlertOkColor}
                    onChange={(event) => setMyStockAlertOkColor(event.target.value)}
                    className="h-10 cursor-pointer p-1"
                    disabled={myStoreSaving}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="my-stock-alert-low-threshold">Valor de estoque baixo (até)</Label>
                  <Input
                    id="my-stock-alert-low-threshold"
                    value={myStockAlertLowThreshold}
                    onChange={(event) =>
                      setMyStockAlertLowThreshold(event.target.value.replace(/[^\d]/g, ""))
                    }
                    placeholder="5"
                    inputMode="numeric"
                    disabled={myStoreSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="my-stock-alert-available-threshold">Valor de estoque disponível (a partir de)</Label>
                  <Input
                    id="my-stock-alert-available-threshold"
                    value={myStockAlertAvailableThreshold}
                    onChange={(event) =>
                      setMyStockAlertAvailableThreshold(event.target.value.replace(/[^\d]/g, ""))
                    }
                    placeholder="6"
                    inputMode="numeric"
                    disabled={myStoreSaving}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Menu mobile</Label>
                <p className="text-xs text-muted-foreground">
                  Escolha ate {MOBILE_MENU_SHORTCUT_LIMIT} atalhos que ficam fixos no rodape do celular.
                  O restante aparece ao expandir o menu.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {storeMobileNavItems.map((item) => {
                  const selected = myMobileMenuShortcuts.includes(item.href)

                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => toggleMobileMenuShortcut(item.href)}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                      disabled={myStoreSaving}
                      aria-pressed={selected}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                          selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {selected ? "Atalho fixo" : "Vai para o menu expandido"}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Smartphone className="size-4" />
                  Preview dos atalhos
                </div>
                <div className="flex flex-wrap gap-2">
                  {effectiveMobileMenuItems.map((item) => (
                    <span
                      key={item.href}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs"
                    >
                      <item.icon className="size-3.5" />
                      {item.title}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Se nenhum atalho for selecionado, usamos o padrao da loja automaticamente.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleSaveMyStoreSettings()}
                className="gap-2"
                disabled={myStoreSaving}
              >
                <Save className="size-4" />
                {myStoreSaving ? "Salvando..." : "Salvar configuracao da loja"}
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
                checked={autoPrintEnabled}
                onCheckedChange={setAutoPrintEnabled}
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Vias e acabamento</Label>
                <p className="text-xs text-muted-foreground">
                  Escolha quais vias saem na impressao automatica. Essas opcoes tambem valem
                  para teste e reimpressao manual.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Checkbox
                    checked={printSellerCopy}
                    onCheckedChange={(checked) => setPrintSellerCopy(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-foreground">
                      Via do vendedor
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Imprime uma via identificada para o atendimento interno.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Checkbox
                    checked={printCustomerCopy}
                    onCheckedChange={(checked) => setPrintCustomerCopy(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-foreground">
                      Via do cliente
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Imprime uma via separada para entregar ao cliente.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="printer-cut-enabled">Corte automatico ao final de cada via</Label>
                  <p className="text-xs text-muted-foreground">
                    Envia o comando de corte sempre que uma nova via for impressa.
                  </p>
                </div>
                <Switch
                  id="printer-cut-enabled"
                  checked={cutAfterEachCopy}
                  onCheckedChange={setCutAfterEachCopy}
                />
              </div>
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
                    <Select value={localPrinterName || undefined} onValueChange={setLocalPrinterName}>
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

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="printer-header-text">Cabecalho da impressao</Label>
                <Textarea
                  id="printer-header-text"
                  value={headerText}
                  onChange={(event) => setHeaderText(event.target.value)}
                  placeholder="Ex.: Loja XPTO - CNPJ 00.000.000/0001-00"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="printer-footer-text">Rodape da impressao</Label>
                <Textarea
                  id="printer-footer-text"
                  value={footerText}
                  onChange={(event) => setFooterText(event.target.value)}
                  placeholder="Ex.: Troca em ate 7 dias com comprovante."
                  rows={3}
                />
              </div>
            </div>

            {validationError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {validationError}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSavePrinter} className="gap-2">
                <Save className="size-4" />
                Salvar configuracoes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleTestPrint()}
                className="gap-2"
              >
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
