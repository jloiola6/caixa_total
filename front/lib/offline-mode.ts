import { getApiUrl } from "@/lib/api"
import { getStoredStoreId } from "@/lib/auth-api"

const OFFLINE_MODE_KEY_PREFIX = "caixatotal_offline_mode_enabled_"
export const OFFLINE_MODE_CHANGED_EVENT = "offline-mode:changed"

function getOfflineModeKey(storeId: string): string {
  return `${OFFLINE_MODE_KEY_PREFIX}${storeId}`
}

export function getOfflineModeEnabledForStore(storeId: string | null | undefined): boolean {
  if (typeof window === "undefined") return true
  if (!storeId) return true
  const raw = localStorage.getItem(getOfflineModeKey(storeId))
  if (raw === "0") return false
  return true
}

export function getOfflineModeEnabledForCurrentStore(): boolean {
  return getOfflineModeEnabledForStore(getStoredStoreId())
}

export function isOnlineOnlyModeForCurrentStore(): boolean {
  return !getOfflineModeEnabledForCurrentStore()
}

export function setOfflineModeEnabledForStore(storeId: string, enabled: boolean): void {
  if (typeof window === "undefined") return
  localStorage.setItem(getOfflineModeKey(storeId), enabled ? "1" : "0")
  window.dispatchEvent(
    new CustomEvent(OFFLINE_MODE_CHANGED_EVENT, {
      detail: { storeId, enabled },
    })
  )
}

export async function ensureOnlinePolicyAllowsWrite(): Promise<{
  allowed: boolean
  error?: string
}> {
  if (typeof window === "undefined") return { allowed: true }
  if (!isOnlineOnlyModeForCurrentStore()) return { allowed: true }

  if (!window.navigator.onLine) {
    return {
      allowed: false,
      error: "Modo offline desabilitado para esta loja. Conecte-se para continuar.",
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 5000)
    const res = await fetch(getApiUrl("/health"), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
    window.clearTimeout(timeoutId)
    if (!res.ok) {
      return {
        allowed: false,
        error: "Modo offline desabilitado para esta loja. A API esta indisponivel.",
      }
    }
    return { allowed: true }
  } catch {
    return {
      allowed: false,
      error: "Modo offline desabilitado para esta loja. A API esta indisponivel.",
    }
  }
}
