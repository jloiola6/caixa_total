"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/caixa")
  }, [router])

  return (
    <div className="flex h-svh items-center justify-center">
      <p className="text-muted-foreground">Carregando...</p>
    </div>
  )
}
