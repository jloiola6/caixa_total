"use client"

import type { ComponentProps } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const sidebarTriggerClass = cn(
  "flex w-full items-center justify-center gap-2 rounded-md p-2 h-8 text-sm outline-none",
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  "transition-colors [&>svg]:size-4 [&>svg]:shrink-0"
)

export function ThemeToggle({
  variant = "default",
  className,
  side = "right",
  align = "end",
}: {
  variant?: "default" | "sidebar"
  className?: string
  side?: ComponentProps<typeof DropdownMenuContent>["side"]
  align?: ComponentProps<typeof DropdownMenuContent>["align"]
}) {
  const { setTheme } = useTheme()

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        className={cn(sidebarTriggerClass, className)}
        aria-label="Aparência"
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute inset-0 size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </span>
        <span className="truncate">Aparência</span>
      </button>
    ) : (
      <Button variant="ghost" size="icon" className={cn("size-9 relative", className)}>
        <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Alternar tema</span>
      </Button>
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? <div className="w-full">{trigger}</div> : trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side}>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 size-4" />
          Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" />
          Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Palette className="mr-2 size-4" />
          Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
