"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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

const navItems = [
  { title: "Caixa", href: "/caixa", icon: ShoppingCart },
  { title: "Produtos", href: "/produtos", icon: Package },
  { title: "Relatorios", href: "/relatorios", icon: BarChart3 },
  { title: "Notificacoes", href: "/notificacoes", icon: Bell },
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

  useEffect(() => {
    let cancelled = false

    const load = async () => {
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
  }, [])

  useEffect(() => {
    const onSyncConflictStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: unknown }>).detail
      const count = Number(detail?.count ?? 0)
      setSyncConflictCount(Number.isFinite(count) && count > 0 ? Math.floor(count) : 0)
    }

    window.addEventListener(SYNC_CONFLICT_STATUS_EVENT, onSyncConflictStatus)
    return () => {
      window.removeEventListener(SYNC_CONFLICT_STATUS_EVENT, onSyncConflictStatus)
    }
  }, [])

  function handleLogout() {
    logout()
    router.replace("/login")
  }

  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <ShoppingCart className="size-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">
              CaixaTotal
            </span>
            <span className="text-xs text-sidebar-foreground/60">
              Sistema PDV
            </span>
          </div>
        </Link>
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
              {user?.role === "SUPER_ADMIN" && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === "/admin"}
                    tooltip="Admin"
                  >
                    <Link href="/admin" onClick={handleNavigate}>
                      <Shield />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-0.5">
            {user?.role === "STORE_USER" && (
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
      <SyncModal open={syncOpen} onOpenChange={setSyncOpen} />
    </Sidebar>
  )
}
