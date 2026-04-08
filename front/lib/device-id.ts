"use client"

const DEVICE_ID_KEY = "caixatotal_device_id"

function createFallbackId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `dev_${Date.now().toString(36)}_${random}`
}

export function getOrCreateDeviceId(): string | null {
  if (typeof window === "undefined") return null

  const stored = localStorage.getItem(DEVICE_ID_KEY)
  if (stored) return stored

  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : createFallbackId()

  localStorage.setItem(DEVICE_ID_KEY, id)
  return id
}
