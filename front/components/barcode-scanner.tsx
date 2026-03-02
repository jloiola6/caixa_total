"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface BarcodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScanned: (code: string) => void
}

export function BarcodeScanner({
  open,
  onOpenChange,
  onScanned,
}: BarcodeScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrCodeRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function startScanner() {
      setIsStarting(true)
      setError(null)

      try {
        const { Html5Qrcode } = await import("html5-qrcode")

        if (cancelled) return

        const scannerId = "barcode-scanner-region"
        const scanner = new Html5Qrcode(scannerId)
        html5QrCodeRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
          },
          (decodedText) => {
            onScanned(decodedText)
            onOpenChange(false)
          },
          () => {
            // Ignore scan failures (no barcode in frame)
          }
        )
      } catch {
        if (!cancelled) {
          setError(
            "Nao foi possivel acessar a camera. Verifique as permissoes do navegador."
          )
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false)
        }
      }
    }

    startScanner()

    return () => {
      cancelled = true
      const scanner = html5QrCodeRef.current
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
        html5QrCodeRef.current = null
      }
    }
  }, [open, onScanned, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear Codigo de Barras</DialogTitle>
          <DialogDescription>
            Aponte a camera para o codigo de barras do produto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            id="barcode-scanner-region"
            ref={scannerRef}
            className="w-full overflow-hidden rounded-md"
          />

          {isStarting && (
            <p className="text-sm text-muted-foreground">
              Iniciando camera...
            </p>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
