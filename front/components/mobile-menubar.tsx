"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LogOut,
  Moon,
  MoreHorizontal,
  Palette,
  RefreshCw,
  Sun,
} from "lucide-react"
import { useTheme } from "next-themes"
import { SyncModal } from "@/components/sync-modal"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useAuth } from "@/contexts/auth-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { getUnreadNotificationsCount, isTransientFetchError } from "@/lib/api"
import { getStoredStoreId } from "@/lib/auth-api"
import {
  getStoredSyncConflictCount,
  SYNC_CONFLICT_STATUS_EVENT,
} from "@/lib/sync-conflict-status"
import {
  getOfflineModeEnabledForCurrentStore,
  OFFLINE_MODE_CHANGED_EVENT,
} from "@/lib/offline-mode"
import { cn } from "@/lib/utils"
import { splitMobileMenuItems } from "@/components/app-navigation"

function isItemActive(pathname: string, href: string) {
  return pathname === href
}

export function MobileMenubar() {
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [syncConflictCount, setSyncConflictCount] = useState(() =>
    getStoredSyncConflictCount()
  )
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(() =>
    getOfflineModeEnabledForCurrentStore()
  )

  const { primaryItems, secondaryItems } = useMemo(
    () => splitMobileMenuItems(user),
    [user]
  )

  useEffect(() => {
    if (!menuOpen) {
      setAppearanceOpen(false)
    }
  }, [menuOpen])

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
      if (typeof window !== "undefined" && !window.navigator.onLine) {
        if (!cancelled) setUnreadNotifications(0)
        return
      }
      try {
        const storeId = getStoredStoreId() ?? undefined
        const unreadCount = await getUnreadNotificationsCount({ storeId })
        if (!cancelled) setUnreadNotifications(unreadCount)
      } catch (error) {
        if (isTransientFetchError(error)) {
          if (!cancelled) setUnreadNotifications(0)
          return
        }
        console.error("Falha ao carregar contador de notificacoes:", error)
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

  if (!isMobile || !user) {
    return null
  }

  function handleNavigate(href: string) {
    setMenuOpen(false)
    router.push(href)
  }

  function handleLogout() {
    setMenuOpen(false)
    logout()
    router.replace("/login")
  }

  const appearanceMeta = (() => {
    if (theme === "light") {
      return {
        icon: Sun,
        label: "Claro",
        helper: "Visual claro ativo",
      }
    }

    if (theme === "dark") {
      return {
        icon: Moon,
        label: "Escuro",
        helper: "Visual escuro ativo",
      }
    }

    return {
      icon: Palette,
      label: "Sistema",
      helper: "Segue o sistema",
    }
  })()

  const appearanceOptions: Array<{
    value: "light" | "dark" | "system"
    label: string
    icon: typeof Sun
  }> = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Escuro", icon: Moon },
    { value: "system", label: "Sistema", icon: Palette },
  ]

  const AppearanceIcon = appearanceMeta.icon

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-stretch gap-1 rounded-[28px] border border-sidebar-border bg-sidebar/95 p-2 text-sidebar-foreground shadow-xl backdrop-blur">
          {primaryItems.map((item) => {
            const active = isItemActive(pathname, item.href)
            const showNotificationsBadge =
              item.href === "/notificacoes" && unreadNotifications > 0

            return (
              <button
                key={item.href}
                type="button"
                onClick={() => handleNavigate(item.href)}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/72"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.mobileLabel ?? item.title}</span>
                {showNotificationsBadge && (
                  <span className="absolute top-1.5 right-2 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors",
              menuOpen
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/72"
            )}
            aria-expanded={menuOpen}
            aria-label="Expandir menu"
          >
            <div className="relative flex items-center justify-center">
              <MoreHorizontal className="size-4 shrink-0" />
              {syncConflictCount > 0 && (
                <span className="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-black">
                  {syncConflictCount}
                </span>
              )}
            </div>
            <span className="inline-flex items-center gap-1">
              Mais
              <ChevronUp className="size-3" />
            </span>
          </button>
        </div>
      </div>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} direction="bottom">
        <DrawerContent className="max-h-[82vh] border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden">
          <DrawerHeader className="text-left">
            <DrawerTitle>Menu mobile</DrawerTitle>
            <DrawerDescription className="text-sidebar-foreground/70">
              Atalhos principais ficam fixos. O restante e as acoes ficam aqui.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-5 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {secondaryItems.length > 0 && (
              <section className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-sidebar-foreground/55">
                  Mais opcoes
                </p>
                <div className="space-y-2">
                  {secondaryItems.map((item) => {
                    const active = isItemActive(pathname, item.href)
                    const showNotificationsBadge =
                      item.href === "/notificacoes" && unreadNotifications > 0

                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => handleNavigate(item.href)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border border-sidebar-border px-4 py-4 text-left transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "bg-sidebar-accent/35 hover:bg-sidebar-accent"
                        )}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
                          <item.icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          {item.href === "/notificacoes" && showNotificationsBadge && (
                            <span className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                              {unreadNotifications} pendente(s)
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-sidebar-foreground/55">
                Acoes
              </p>
              <div className="space-y-2">
                {user.role === "STORE_USER" && offlineModeEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setSyncOpen(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/35 px-4 py-4 text-left transition-colors hover:bg-sidebar-accent"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
                      {syncConflictCount > 0 ? (
                        <AlertTriangle className="size-5 text-amber-500" />
                      ) : (
                        <RefreshCw className="size-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">Sincronizar</span>
                      <span className="block text-xs text-sidebar-foreground/65">
                        {syncConflictCount > 0
                          ? `${syncConflictCount} conflito(s) pendente(s)`
                          : "Conferir e enviar alteracoes locais"}
                      </span>
                    </span>
                  </button>
                )}

                <Collapsible open={appearanceOpen} onOpenChange={setAppearanceOpen}>
                  <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/35 transition-colors">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-sidebar-accent"
                        aria-expanded={appearanceOpen}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
                          <AppearanceIcon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">Aparencia</span>
                          <span className="block text-xs text-sidebar-foreground/65">
                            {appearanceMeta.helper}
                          </span>
                        </span>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="px-4 pb-4">
                      <div className="grid grid-cols-3 gap-2 border-t border-sidebar-border pt-3">
                        {appearanceOptions.map((option) => {
                          const selected = theme === option.value

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setTheme(option.value)}
                              className={cn(
                                "flex flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-medium transition-colors",
                                selected
                                  ? "border-primary bg-primary/12 text-primary"
                                  : "border-sidebar-border bg-sidebar hover:bg-sidebar-accent"
                              )}
                              aria-pressed={selected}
                            >
                              <option.icon className="size-4" />
                              <span>{option.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/35 px-4 py-4 text-left transition-colors hover:bg-sidebar-accent"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm">
                    <LogOut className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">Sair</span>
                    <span className="block text-xs text-sidebar-foreground/65">
                      Encerrar sessao deste usuario
                    </span>
                  </span>
                </button>
              </div>
            </section>
          </div>
        </DrawerContent>
      </Drawer>

      {user.role === "STORE_USER" && offlineModeEnabled && (
        <SyncModal open={syncOpen} onOpenChange={setSyncOpen} />
      )}
    </>
  )
}
