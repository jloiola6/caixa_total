"use client"

import { getStoredStoreId } from "@/lib/auth-api"
import { getApiUrl, getAuthHeaders } from "@/lib/api"
import { getOrCreateDeviceId } from "@/lib/device-id"

type PushPermission = NotificationPermission | "unsupported"

type PushPublicKeyResponse = {
  enabled?: unknown
  publicKey?: unknown
}

export type PushSetupStatus = {
  supported: boolean
  serverEnabled: boolean
  permission: PushPermission
  enabled: boolean
  reason?: string
}

type EnsurePushOptions = {
  requestPermission?: boolean
}

function isPushSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

function withStoreId(path: string): string {
  const storeId = getStoredStoreId()
  if (!storeId) return path
  const query = new URLSearchParams({ storeId })
  const suffix = path.includes("?") ? "&" : "?"
  return `${path}${suffix}${query.toString()}`
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  return registration
}

async function fetchPushPublicKey(): Promise<string | null> {
  const res = await fetch(getApiUrl(withStoreId("/notifications/push/public-key")), {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Falha ao obter chave de push: ${res.status}`)
  }

  const data = (await res.json()) as PushPublicKeyResponse
  const enabled = data.enabled === true
  const publicKey =
    typeof data.publicKey === "string" && data.publicKey.trim()
      ? data.publicKey.trim()
      : null
  if (!enabled || !publicKey) return null
  return publicKey
}

async function subscribeOnBackend(subscription: PushSubscription): Promise<void> {
  const deviceId = getOrCreateDeviceId()
  const headers = getAuthHeaders(true)
  if (deviceId) {
    headers["x-device-id"] = deviceId
  }

  const res = await fetch(getApiUrl(withStoreId("/notifications/push/subscribe")), {
    method: "POST",
    headers,
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceId,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }),
  })

  if (!res.ok) {
    throw new Error(`Falha ao registrar push no backend: ${res.status}`)
  }
}

async function unsubscribeOnBackend(endpoint: string | null): Promise<void> {
  const deviceId = getOrCreateDeviceId()
  const headers = getAuthHeaders(true)
  if (deviceId) {
    headers["x-device-id"] = deviceId
  }

  const res = await fetch(getApiUrl(withStoreId("/notifications/push/unsubscribe")), {
    method: "POST",
    headers,
    body: JSON.stringify({
      endpoint,
      deviceId,
    }),
  })

  if (!res.ok) {
    throw new Error(`Falha ao remover push no backend: ${res.status}`)
  }
}

export async function getPushSetupStatus(): Promise<PushSetupStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      serverEnabled: false,
      permission: "unsupported",
      enabled: false,
      reason: "Navegador sem suporte a Push API/Service Worker",
    }
  }

  const publicKey = await fetchPushPublicKey()
  if (!publicKey) {
    return {
      supported: true,
      serverEnabled: false,
      permission: Notification.permission,
      enabled: false,
      reason: "Push não está configurado no servidor",
    }
  }

  const registration = await registerServiceWorker()
  const subscription = await registration.pushManager.getSubscription()

  if (subscription && Notification.permission === "granted") {
    try {
      await subscribeOnBackend(subscription)
    } catch (error) {
      console.error("Falha ao sincronizar assinatura de push:", error)
    }
  }

  return {
    supported: true,
    serverEnabled: true,
    permission: Notification.permission,
    enabled: Notification.permission === "granted" && Boolean(subscription),
  }
}

export async function ensurePushSubscription(
  options: EnsurePushOptions = {}
): Promise<PushSetupStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      serverEnabled: false,
      permission: "unsupported",
      enabled: false,
      reason: "Navegador sem suporte a Push API/Service Worker",
    }
  }

  const publicKey = await fetchPushPublicKey()
  if (!publicKey) {
    return {
      supported: true,
      serverEnabled: false,
      permission: Notification.permission,
      enabled: false,
      reason: "Push não está configurado no servidor",
    }
  }

  let permission: NotificationPermission = Notification.permission
  if (permission !== "granted" && options.requestPermission) {
    permission = await Notification.requestPermission()
  }

  if (permission !== "granted") {
    return {
      supported: true,
      serverEnabled: true,
      permission,
      enabled: false,
      reason:
        permission === "denied"
          ? "Permissão de notificações negada no navegador"
          : "Permissão de notificações ainda não concedida",
    }
  }

  const registration = await registerServiceWorker()
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    })
  }

  await subscribeOnBackend(subscription)

  return {
    supported: true,
    serverEnabled: true,
    permission,
    enabled: true,
  }
}

export async function disablePushSubscription(): Promise<PushSetupStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      serverEnabled: false,
      permission: "unsupported",
      enabled: false,
      reason: "Navegador sem suporte a Push API/Service Worker",
    }
  }

  const registration = await registerServiceWorker()
  const subscription = await registration.pushManager.getSubscription()
  const endpoint = subscription?.endpoint ?? null

  try {
    await unsubscribeOnBackend(endpoint)
  } catch (error) {
    console.error("Falha ao remover assinatura de push no backend:", error)
  }

  if (subscription) {
    await subscription.unsubscribe()
  }

  return {
    supported: true,
    serverEnabled: true,
    permission: Notification.permission,
    enabled: false,
  }
}

export async function clearLocalPushSubscription(): Promise<void> {
  if (!isPushSupported()) return

  const registration =
    (await navigator.serviceWorker.getRegistration("/sw.js")) ??
    (await navigator.serviceWorker.getRegistration())

  if (!registration) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await subscription.unsubscribe()
}
