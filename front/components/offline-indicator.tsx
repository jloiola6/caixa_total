"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, WifiOff } from "lucide-react";
import { getApiUrl, getSyncState } from "@/lib/api";
import { getStoredStoreId } from "@/lib/auth-api";
import { computeConflicts } from "@/lib/sync-conflict";
import {
  dispatchSyncConflictStatus,
  getStoredSyncConflictCount,
  SYNC_CONFLICT_STATUS_EVENT,
} from "@/lib/sync-conflict-status";
import {
  getOfflineModeEnabledForCurrentStore,
  OFFLINE_MODE_CHANGED_EVENT,
} from "@/lib/offline-mode";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";

function getInitialOnlineStatus(): boolean {
  if (typeof window === "undefined") return true;
  return window.navigator.onLine;
}

async function checkApiOnline(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl("/health"), {
      method: "GET",
      cache: "no-store",
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function OfflineIndicator() {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [syncConflictCount, setSyncConflictCount] = useState(0);
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(() =>
    getOfflineModeEnabledForCurrentStore()
  );
  const wasOfflineRef = useRef(false);
  const checkingConflictsRef = useRef(false);
  const isStoreUser = user?.role === "STORE_USER";
  const syncFeaturesEnabled = isStoreUser && offlineModeEnabled;
  const shouldPollApiHealth = syncFeaturesEnabled;

  useEffect(() => {
    let mounted = true;
    let intervalId: number | null = null;

    const runHealthCheck = async () => {
      if (!shouldPollApiHealth) {
        if (!mounted) return;
        setApiOnline(null);
        return;
      }
      if (!window.navigator.onLine) {
        if (!mounted) return;
        setApiOnline(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const ok = await checkApiOnline(controller.signal);
      window.clearTimeout(timeoutId);

      if (!mounted) return;
      setApiOnline(ok);
    };

    const handleOnline = () => {
      setIsOnline(true);
      void runHealthCheck();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setApiOnline(false);
    };
    const handleFocus = () => {
      setIsOnline(window.navigator.onLine);
      void runHealthCheck();
    };

    setIsOnline(window.navigator.onLine);
    if (shouldPollApiHealth) {
      void runHealthCheck();
    } else {
      setApiOnline(null);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (shouldPollApiHealth) {
      window.addEventListener("focus", handleFocus);
    }

    if (shouldPollApiHealth) {
      intervalId = window.setInterval(() => {
        setIsOnline(window.navigator.onLine);
        void runHealthCheck();
      }, 30000);
    }

    return () => {
      mounted = false;
      if (intervalId != null) window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (shouldPollApiHealth) {
        window.removeEventListener("focus", handleFocus);
      }
    };
  }, [shouldPollApiHealth]);

  const isOffline = !isOnline || apiOnline === false;
  const hasPendingConflicts = syncFeaturesEnabled && syncConflictCount > 0;

  useEffect(() => {
    if (!syncFeaturesEnabled) {
      setSyncConflictCount(0);
      return;
    }
    setSyncConflictCount(getStoredSyncConflictCount());
    const onSyncConflictStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: unknown }>).detail;
      const count = Number(detail?.count ?? 0);
      setSyncConflictCount(Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
    };
    window.addEventListener(SYNC_CONFLICT_STATUS_EVENT, onSyncConflictStatus);
    return () => {
      window.removeEventListener(SYNC_CONFLICT_STATUS_EVENT, onSyncConflictStatus);
    };
  }, [syncFeaturesEnabled]);

  useEffect(() => {
    const refreshOfflineMode = () => setOfflineModeEnabled(getOfflineModeEnabledForCurrentStore());
    refreshOfflineMode();
    window.addEventListener("storage", refreshOfflineMode);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, refreshOfflineMode);
    return () => {
      window.removeEventListener("storage", refreshOfflineMode);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, refreshOfflineMode);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const verifyConflictsAfterReconnect = async () => {
      if (checkingConflictsRef.current || !mounted) return;
      if (typeof window === "undefined") return;
      const token = localStorage.getItem("caixatotal_token");
      if (!token) {
        dispatchSyncConflictStatus(0);
        return;
      }

      checkingConflictsRef.current = true;
      try {
        const storeId = getStoredStoreId() ?? undefined;
        const server = await getSyncState(storeId);
        const conflicts = await computeConflicts(server);
        if (!mounted) return;
        dispatchSyncConflictStatus(conflicts.length);

        if (conflicts.length > 0) {
          toast.warning(
            `${conflicts.length} conflito(s) detectado(s) após reconexão. Abra "Sincronizar" para resolver.`
          );
        }
      } catch {
        if (!mounted) return;
        toast.error("Conexão voltou, mas a verificação automática de conflitos falhou.");
      } finally {
        checkingConflictsRef.current = false;
      }
    };

    if (!syncFeaturesEnabled) {
      wasOfflineRef.current = isOffline;
      return () => {
        mounted = false;
      };
    }

    if (wasOfflineRef.current && !isOffline) {
      void verifyConflictsAfterReconnect();
    }
    wasOfflineRef.current = isOffline;

    return () => {
      mounted = false;
    };
  }, [isOffline, syncFeaturesEnabled]);

  if (!isOffline && !hasPendingConflicts) return null;

  const isConflictMode = syncFeaturesEnabled && !isOffline && hasPendingConflicts;
  const isOfflineBlockedByPolicy = !offlineModeEnabled && isOffline;
  const containerClass = isConflictMode
    ? "animate-[pulse_1.6s_ease-in-out_infinite] border-y border-yellow-300/80 bg-[linear-gradient(to_bottom,oklch(0.78_0.12_92)_0%,oklch(0.88_0.1_95)_48%,var(--background)_100%)] px-4 py-2 shadow-[0_0_0_1px_rgba(253,224,71,0.25)]"
    : isOfflineBlockedByPolicy
      ? "border-y border-red-300/80 bg-[linear-gradient(to_bottom,oklch(0.45_0.18_25)_0%,oklch(0.56_0.2_25)_48%,var(--background)_100%)] px-4 py-2 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]"
      : "border-y border-yellow-300/80 bg-[linear-gradient(to_bottom,oklch(0.45_0.18_25)_0%,oklch(0.56_0.2_25)_48%,var(--background)_100%)] px-4 py-2 shadow-[0_0_0_1px_rgba(253,224,71,0.25)]";
  const contentClass = isConflictMode
    ? "flex items-center justify-center gap-2 text-xs font-medium text-zinc-900 [text-shadow:0_1px_1px_rgba(255,255,255,0.25)] dark:text-gray-100 dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.45)] sm:text-sm"
    : "flex items-center justify-center gap-2 text-xs font-medium text-gray-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] sm:text-sm";

  return (
    <div role="status" aria-live="polite" className={containerClass}>
      <div className={contentClass}>
        {isConflictMode ? (
          <>
            <AlertTriangle className="size-4 shrink-0 text-yellow-700 dark:text-yellow-300" />
            <span className="font-semibold">
              {syncConflictCount} conflito(s) de sincronização pendente(s)
            </span>
            <span className="hidden sm:inline">
              Abra "Sincronizar" para revisar e corrigir.
            </span>
          </>
        ) : (
          <>
            <WifiOff className={`size-4 shrink-0 ${isOfflineBlockedByPolicy ? "text-red-300" : "text-yellow-300"}`} />
            <span className="font-semibold">
              {isOfflineBlockedByPolicy ? "Sem conexão com API (offline desabilitado)" : "Modo offline ativo"}
            </span>
            <span className="hidden sm:inline">
              {isOfflineBlockedByPolicy
                ? "Esta loja exige API online para operar."
                : "Alteracoes ficam locais e sincronizam quando a conexao voltar."}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
