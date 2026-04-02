"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, CheckCheck, Receipt, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api"
import { getStoredStoreId } from "@/lib/auth-api"
import { formatDate } from "@/lib/format"
import type { AppNotification } from "@/lib/types"
import { toast } from "sonner"

function formatDateSafe(iso: string): string {
  try {
    return formatDate(iso)
  } catch {
    return iso
  }
}

export default function NotificacoesPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const loadNotifications = useCallback(async () => {
    try {
      const storeId = getStoredStoreId() ?? undefined
      const data = await getNotifications({ limit: 500, storeId })
      setNotifications(
        data.map((notification) => ({
          ...notification,
          saleCreatedAt: notification.saleCreatedAt,
        }))
      )
    } catch (e) {
      console.error("Falha ao carregar notificacoes:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (cancelled) return
      await loadNotifications()
    }

    void run()
    const interval = window.setInterval(() => void run(), 30000)
    const onFocus = () => void run()
    const onNotificationsUpdated = () => void run()

    window.addEventListener("focus", onFocus)
    window.addEventListener("notifications:updated", onNotificationsUpdated)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("notifications:updated", onNotificationsUpdated)
    }
  }, [loadNotifications])

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  )

  async function handleRead(id: string) {
    try {
      const storeId = getStoredStoreId() ?? undefined
      await markNotificationAsRead(id, { storeId })
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? { ...notification, readAt: new Date().toISOString() }
            : notification
        )
      )
      window.dispatchEvent(new Event("notifications:updated"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao marcar notificacao como lida")
    }
  }

  async function handleReadAll() {
    try {
      const storeId = getStoredStoreId() ?? undefined
      await markAllNotificationsAsRead({ storeId })
      const now = new Date().toISOString()
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, readAt: notification.readAt ?? now }))
      )
      window.dispatchEvent(new Event("notifications:updated"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao marcar notificacoes como lidas")
    }
  }

  function handleViewDetails(notification: AppNotification) {
    if (!notification.saleId) return

    const query = new URLSearchParams({
      view: "report",
      saleId: notification.saleId,
    })

    if (notification.saleCreatedAt) {
      query.set("saleDate", notification.saleCreatedAt)
    }

    router.push(`/relatorios?${query.toString()}`)
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Notificacoes
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe as vendas recentes e alertas do sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={unreadCount > 0 ? "default" : "secondary"}>
            {unreadCount} nao lida(s)
          </Badge>
          <Button
            type="button"
            variant="outline"
            onClick={handleReadAll}
            disabled={unreadCount === 0}
            className="gap-2"
          >
            <CheckCheck className="size-4" />
            Marcar todas como lidas
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Bell className="size-6 text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground">Carregando notificacoes...</p>
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Bell className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificacao por enquanto.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={notification.readAt ? "opacity-80" : "border-primary/50"}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="size-4 text-muted-foreground" />
                    {notification.title}
                  </CardTitle>
                  {!notification.readAt && <Badge>Novo</Badge>}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-foreground">{notification.message}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Registrada em {formatDateSafe(notification.createdAt)}</span>
                  <span>
                    Venda: {notification.saleCreatedAt ? formatDateSafe(notification.saleCreatedAt) : "-"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {notification.saleId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(notification)}
                      className="gap-1.5"
                    >
                      <Search className="size-3.5" />
                      Ver detalhes
                    </Button>
                  )}
                  {!notification.readAt && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRead(notification.id)}
                      className="gap-1.5"
                    >
                      <Check className="size-3.5" />
                      Marcar como lida
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
