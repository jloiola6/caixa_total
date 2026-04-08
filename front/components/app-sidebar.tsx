"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  ShoppingCart,
  Package,
  BarChart3,
  RefreshCw,
  Shield,
  LogOut,
  Bell,
  AlertTriangle,
  Settings,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { SyncModal } from "@/components/sync-modal"
import { useAuth } from "@/contexts/auth-context"
import { Badge } from "@/components/ui/badge"
import { getUnreadNotificationsCount } from "@/lib/api"
import { getStoredStoreId } from "@/lib/auth-api"
import { getStoredSyncConflictCount, SYNC_CONFLICT_STATUS_EVENT } from "@/lib/sync-conflict-status"
import {
  getOfflineModeEnabledForCurrentStore,
  OFFLINE_MODE_CHANGED_EVENT,
} from "@/lib/offline-mode"

const storeUserNavItems = [
  { title: "Caixa", href: "/caixa", icon: ShoppingCart },
  { title: "Produtos", href: "/produtos", icon: Package },
  { title: "Relatorios", href: "/relatorios", icon: BarChart3 },
  { title: "Notificacoes", href: "/notificacoes", icon: Bell },
  { title: "Configuracoes", href: "/configuracoes", icon: Settings },
]

const superAdminNavItems = [
  { title: "Admin", href: "/admin", icon: Shield },
  { title: "Configuracoes", href: "/configuracoes", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const { user, logout } = useAuth()
  const [syncOpen, setSyncOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [syncConflictCount, setSyncConflictCount] = useState(() => getStoredSyncConflictCount())
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(() =>
    getOfflineModeEnabledForCurrentStore()
  )

  useEffect(() => {
    const refreshOfflineMode = () => setOfflineModeEnabled(getOfflineModeEnabledForCurrentStore())
    refreshOfflineMode()
    window.addEventListener("storage", refreshOfflineMode)
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, refreshOfflineMode)
    return () => {
      window.removeEventListener("storage", refreshOfflineMode)
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, refreshOfflineMode)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (user?.role !== "STORE_USER") {
        if (!cancelled) setUnreadNotifications(0)
        return
      }
      try {
        const storeId = getStoredStoreId() ?? undefined
        const unreadCount = await getUnreadNotificationsCount({ storeId })
        if (!cancelled) setUnreadNotifications(unreadCount)
      } catch (e) {
        console.error("Falha ao carregar contador de notificacoes:", e)
      }
    }

    void load()
    const interval = window.setInterval(() => void load(), 30000)
    const onFocus = () => void load()
    const onStorage = () => void load()
    const onNotificationsUpdated = () => void load()

    window.addEventListener("focus", onFocus)
    window.addEventListener("storage", onStorage)
    window.addEventListener("notifications:updated", onNotificationsUpdated)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("notifications:updated", onNotificationsUpdated)
    }
  }, [user?.role])

  useEffect(() => {
    if (user?.role !== "STORE_USER" || !offlineModeEnabled) {
      setSyncConflictCount(0)
      return
    }

    const onSyncConflictStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: unknown }>).detail
      const count = Number(detail?.count ?? 0)
      setSyncConflictCount(Number.isFinite(count) && count > 0 ? Math.floor(count) : 0)
    }

    window.addEventListener(SYNC_CONFLICT_STATUS_EVENT, onSyncConflictStatus)
    return () => {
      window.removeEventListener(SYNC_CONFLICT_STATUS_EVENT, onSyncConflictStatus)
    }
  }, [user?.role, offlineModeEnabled])

  function handleLogout() {
    logout()
    router.replace("/login")
  }

  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const navItems = user?.role === "SUPER_ADMIN" ? superAdminNavItems : storeUserNavItems

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex flex-col gap-1">
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/caixa-total-logo.png"
              alt="Logo Caixa Total"
              width={768}
              height={512}
              className="h-11 w-auto rounded-md"
              priority
            />
          </Link>
          <span className="text-xs text-sidebar-foreground/60">Sistema PDV</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href} onClick={handleNavigate}>
                      <item.icon />
                      <span>{item.title}</span>
                      {item.href === "/notificacoes" && unreadNotifications > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 justify-center px-1 text-[11px]">
                          {unreadNotifications}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-0.5">
            {user?.role === "STORE_USER" && offlineModeEnabled && (
              <SidebarMenuButton
                tooltip="Sincronizar"
                onClick={() => setSyncOpen(true)}
                className="w-full justify-center"
              >
                {syncConflictCount > 0 ? (
                  <>
                    <AlertTriangle className="size-4 text-amber-500" />
                    <span className="sr-only">{syncConflictCount} conflito(s) pendente(s)</span>
                  </>
                ) : (
                  <RefreshCw className="size-4" />
                )}
                <span>Sincronizar</span>
              </SidebarMenuButton>
            )}
            <ThemeToggle variant="sidebar" className="w-full justify-center" />
            <SidebarMenuButton
              tooltip="Sair"
              onClick={handleLogout}
              className="w-full justify-center"
            >
              <LogOut className="size-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
      {user?.role === "STORE_USER" && offlineModeEnabled && (
        <SyncModal open={syncOpen} onOpenChange={setSyncOpen} />
      )}
    </Sidebar>
  )
}
