"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShoppingCart, Package, BarChart3, RefreshCw } from "lucide-react"
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
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { SyncModal } from "@/components/sync-modal"

const navItems = [
  { title: "Caixa", href: "/caixa", icon: ShoppingCart },
  { title: "Produtos", href: "/produtos", icon: Package },
  { title: "Relatorios", href: "/relatorios", icon: BarChart3 },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [syncOpen, setSyncOpen] = useState(false)

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
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
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
            <SidebarMenuButton
              tooltip="Sincronizar"
              onClick={() => setSyncOpen(true)}
              className="w-full justify-center"
            >
              <RefreshCw className="size-4" />
              <span>Sincronizar</span>
            </SidebarMenuButton>
            <ThemeToggle variant="sidebar" className="w-full justify-center" />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
      <SyncModal open={syncOpen} onOpenChange={setSyncOpen} />
    </Sidebar>
  )
}
