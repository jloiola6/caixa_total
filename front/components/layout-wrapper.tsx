"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileMenubar } from "@/components/mobile-menubar";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useAuth } from "@/contexts/auth-context";

const AUTH_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha"];
const PUBLIC_PATHS = ["/loja"];

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isAuthPage = AUTH_PATHS.some((p) => pathname?.startsWith(p));
  const isPublicPage = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (loading || isAuthPage || isPublicPage) return;
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [user, loading, isAuthPage, isPublicPage, router]);

  if (isAuthPage) {
    return (
      <>
        <OfflineIndicator />
        <div className="min-h-svh flex items-center justify-center bg-muted/30 p-4">
          {children}
        </div>
      </>
    );
  }

  if (isPublicPage) {
    return (
      <>
        <OfflineIndicator />
        <div className="min-h-svh">{children}</div>
      </>
    );
  }

  if (!loading && !user) {
    return (
      <>
        <OfflineIndicator />
        <div className="min-h-svh flex items-center justify-center bg-muted/30 p-4">
          <p className="text-muted-foreground">Redirecionando para o login...</p>
        </div>
      </>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <OfflineIndicator />
        <div className="flex-1 overflow-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
        <MobileMenubar />
      </SidebarInset>
    </SidebarProvider>
  );
}
