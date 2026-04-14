import {
  BarChart3,
  Bell,
  Landmark,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react"
import type { AuthUser } from "@/lib/auth-api"

export const MOBILE_MENU_SHORTCUT_LIMIT = 4

export type AppNavItem = {
  title: string
  mobileLabel?: string
  href: string
  icon: LucideIcon
}

type NavigationUser = Pick<AuthUser, "role" | "store"> | null | undefined

const STORE_USER_NAV_ITEMS: AppNavItem[] = [
  { title: "Caixa", mobileLabel: "Caixa", href: "/caixa", icon: ShoppingCart },
  { title: "Produtos", mobileLabel: "Produtos", href: "/produtos", icon: Package },
  { title: "Financeiro", mobileLabel: "Financeiro", href: "/financeiro", icon: Landmark },
  { title: "Relatorios", mobileLabel: "Relatorios", href: "/relatorios", icon: BarChart3 },
  { title: "Notificacoes", mobileLabel: "Avisos", href: "/notificacoes", icon: Bell },
  { title: "Configuracoes", mobileLabel: "Ajustes", href: "/configuracoes", icon: Settings },
]

const SUPER_ADMIN_NAV_ITEMS: AppNavItem[] = [
  { title: "Admin", mobileLabel: "Admin", href: "/admin", icon: Shield },
  { title: "Configuracoes", mobileLabel: "Ajustes", href: "/configuracoes", icon: Settings },
]

export function getStoreUserNavItems(financeModuleEnabled = true): AppNavItem[] {
  if (financeModuleEnabled) return STORE_USER_NAV_ITEMS
  return STORE_USER_NAV_ITEMS.filter((item) => item.href !== "/financeiro")
}

export function getNavItemsForUser(user: NavigationUser): AppNavItem[] {
  if (user?.role === "SUPER_ADMIN") return SUPER_ADMIN_NAV_ITEMS
  return getStoreUserNavItems(user?.store?.financeModuleEnabled !== false)
}

export function getDefaultMobileMenuShortcuts(items: AppNavItem[]): string[] {
  return items.slice(0, MOBILE_MENU_SHORTCUT_LIMIT).map((item) => item.href)
}

export function sanitizeMobileMenuShortcuts(
  shortcuts: string[] | null | undefined,
  items: AppNavItem[],
): string[] {
  if (!Array.isArray(shortcuts) || shortcuts.length === 0) return []

  const requested = new Set(
    shortcuts.filter((value): value is string => typeof value === "string")
  )

  return items
    .filter((item) => requested.has(item.href))
    .slice(0, MOBILE_MENU_SHORTCUT_LIMIT)
    .map((item) => item.href)
}

export function resolveMobileMenuShortcuts(
  shortcuts: string[] | null | undefined,
  items: AppNavItem[],
): string[] {
  const sanitized = sanitizeMobileMenuShortcuts(shortcuts, items)
  if (sanitized.length > 0) return sanitized
  return getDefaultMobileMenuShortcuts(items)
}

export function splitMobileMenuItems(user: NavigationUser) {
  const items = getNavItemsForUser(user)
  const shortcuts = resolveMobileMenuShortcuts(
    user?.store?.mobileMenuShortcuts,
    items,
  )
  const shortcutSet = new Set(shortcuts)

  return {
    items,
    shortcuts,
    primaryItems: items.filter((item) => shortcutSet.has(item.href)),
    secondaryItems: items.filter((item) => !shortcutSet.has(item.href)),
  }
}
