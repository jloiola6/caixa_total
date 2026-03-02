"use client"

import { useEffect, useCallback } from "react"

type KeyHandler = (e: KeyboardEvent) => void

interface ShortcutMap {
  [key: string]: KeyHandler
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable

      // Allow F-keys and Escape even when in inputs
      const isFunctionKey = e.key.startsWith("F") && e.key.length <= 3
      const isEscape = e.key === "Escape"

      if (isInput && !isFunctionKey && !isEscape) return

      const handler = shortcuts[e.key]
      if (handler) {
        e.preventDefault()
        handler(e)
      }
    },
    [shortcuts]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}
