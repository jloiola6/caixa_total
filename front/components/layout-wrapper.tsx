"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useAuth } from "@/contexts/auth-context";

const AUTH_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha"];

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isAuthPage = AUTH_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (loading || isAuthPage) return;
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [user, loading, isAuthPage, router]);

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
        <header className="flex h-12 items-center gap-2 px-4 md:hidden">
          <SidebarTrigger />
          <Link href="/" className="inline-flex items-center">
            <Image
              src="/caixa-total-logo.png"
              alt="Logo Caixa Total"
              width={768}
              height={512}
              className="h-8 w-auto rounded-sm"
              priority
            />
          </Link>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
