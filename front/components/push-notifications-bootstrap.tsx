"use client"

import { useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { ensurePushSubscription } from "@/lib/push-notifications"
import { isTransientFetchError } from "@/lib/api"

export function PushNotificationsBootstrap() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading || user?.role !== "STORE_USER") return

    let cancelled = false

    const syncPush = async () => {
      if (cancelled) return
      if (typeof window !== "undefined" && !window.navigator.onLine) return
      try {
        await ensurePushSubscription({ requestPermission: false })
      } catch (error) {
        if (isTransientFetchError(error)) return
        console.error("Falha ao sincronizar push:", error)
      }
    }

    void syncPush()
    const intervalId = window.setInterval(() => void syncPush(), 30 * 60 * 1000)
    const onFocus = () => void syncPush()

    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [loading, user?.id, user?.role, user?.storeId])

  return null
}
