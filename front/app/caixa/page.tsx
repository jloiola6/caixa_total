"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import {
  Search,
  Camera,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { BarcodeScanner } from "@/components/barcode-scanner"
import { CheckoutDialog } from "@/components/checkout-dialog"
import {
  getProducts,
  getProductByBarcode,
  createSale,
} from "@/lib/db"
import { formatCurrency } from "@/lib/format"
import { syncToServer } from "@/lib/sync"
import type { Product, CartItem, PaymentSplit } from "@/lib/types"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcut"
import { toast } from "sonner"

export default function CaixaPage() {
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [clearCartOpen, setClearCartOpen] = useState(false)
  const [saleCompleteOpen, setSaleCompleteOpen] = useState(false)
  const [lastSaleTotal, setLastSaleTotal] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.priceCents * item.qty, 0),
    [cart]
  )

  const cartItemsCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty, 0),
    [cart]
  )

  // Search products
  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value)
      if (value.trim().length === 0) {
        setSearchResults([])
        return
      }
      const results = getProducts(value)
      setSearchResults(results)
    },
    []
  )

  // Handle barcode scan or Enter in search
  const handleSearchSubmit = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return
      const value = query.trim()
      if (!value) return

      // Try exact barcode match first
      const byBarcode = getProductByBarcode(value)
      if (byBarcode) {
        addToCart(byBarcode)
        setQuery("")
        setSearchResults([])
        return
      }

      // If only one search result, add it
      const results = getProducts(value)
      if (results.length === 1) {
        addToCart(results[0])
        setQuery("")
        setSearchResults([])
      }
    },
    [query]
  )

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        if (existing.qty >= product.stock) {
          toast.error(`Estoque insuficiente para ${product.name}`)
          return prev
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item
        )
      }
      if (product.stock <= 0) {
        toast.error(`${product.name} esta sem estoque`)
        return prev
      }
      return [...prev, { product, qty: 1 }]
    })
    toast.success(`${product.name} adicionado`)
  }

  function updateQty(productId: string, newQty: number) {
    if (newQty <= 0) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item
        if (newQty > item.product.stock) {
          toast.error("Quantidade excede o estoque disponivel")
          return item
        }
        return { ...item, qty: newQty }
      })
    )
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  function handleFinalizeSale() {
    if (cart.length === 0) {
      toast.error("Carrinho vazio")
      return
    }
    setCheckoutOpen(true)
  }

  function confirmSale(payments: PaymentSplit[], customerName: string | null, customerPhone: string | null) {
    const result = createSale({
      items: cart,
      payments,
      customerName,
      customerPhone,
    })
    if (!result) {
      toast.error("Erro ao registrar venda. Verifique o estoque.")
      return
    }
    setLastSaleTotal(result.sale.totalCents)
    setCart([])
    setQuery("")
    setSearchResults([])
    setCheckoutOpen(false)
    setSaleCompleteOpen(true)
    syncToServer().catch(() => {})
  }

  function handleClearCart() {
    if (cart.length === 0) return
    setClearCartOpen(true)
  }

  function confirmClear() {
    setCart([])
    setQuery("")
    setSearchResults([])
    setClearCartOpen(false)
    toast.success("Carrinho limpo")
  }

  function handleBarcodeScanned(code: string) {
    const product = getProductByBarcode(code)
    if (product) {
      addToCart(product)
    } else {
      toast.error(`Produto nao encontrado: ${code}`)
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => ({
        F2: () => searchInputRef.current?.focus(),
        F9: () => handleFinalizeSale(),
        Escape: () => handleClearCart(),
      }),
      [cart]
    )
  )

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col md:h-svh">
      {/* Top bar with shortcuts hint */}
      <div className="hidden md:flex items-center justify-between border-b border-border bg-muted/30 px-6 py-2">
        <h1 className="text-lg font-semibold text-foreground">Caixa</h1>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              F2
            </kbd>{" "}
            Buscar
          </span>
          <span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            Adicionar
          </span>
          <span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              F9
            </kbd>{" "}
            Finalizar
          </span>
          <span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            Limpar
          </span>
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Caixa</h1>
        {cart.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <ShoppingCart className="size-3" />
            {cartItemsCount}
          </Badge>
        )}
      </div>

      {/* Main content: 2 columns on desktop */}
      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left: Search + Results */}
        <div className="flex flex-col md:w-1/2 md:border-r border-border overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleSearchSubmit}
                placeholder="Buscar produto ou escanear codigo..."
                className="pl-9"
                autoFocus
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setScannerOpen(true)}
              title="Escanear código de barras"
            >
              <Camera className="size-4" />
            </Button>
          </div>

          {/* Search results */}
          <div className="flex-1 overflow-auto p-4">
            {query.trim() === "" ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
                <Search className="size-10 opacity-30" />
                <p className="text-sm">
                  Digite o nome, SKU ou código de barras para buscar
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum produto encontrado
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {searchResults.map((product) => (
                  <Card
                    key={product.id}
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => addToCart(product)}
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="size-9 rounded-md object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs font-semibold shrink-0">
                          {product.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground truncate">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {(product.type || product.brand) && (
                            <span className="text-xs text-muted-foreground">
                              {product.type || product.brand}
                            </span>
                          )}
                          {product.sku && (
                            <span className="text-xs text-muted-foreground">
                              {product.sku}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Est: {product.stock}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-foreground ml-3 shrink-0">
                        {formatCurrency(product.priceCents)}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className="flex flex-col md:w-1/2 overflow-hidden border-t md:border-t-0 border-border">
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Carrinho
              </span>
              {cart.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {cartItemsCount} item(ns)
                </Badge>
              )}
            </div>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={handleClearCart}
              >
                <X className="size-3 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-auto p-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
                <ShoppingCart className="size-10 opacity-30" />
                <p className="text-sm">Carrinho vazio</p>
                <p className="text-xs">
                  Busque e adicione produtos para iniciar uma venda
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    {item.product.imageUrl ? (
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="size-9 rounded-md object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs font-semibold shrink-0">
                        {item.product.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.product.priceCents)} un.
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() =>
                          updateQty(item.product.id, item.qty - 1)
                        }
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium text-foreground">
                        {item.qty}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        onClick={() =>
                          updateQty(item.product.id, item.qty + 1)
                        }
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>

                    <span className="text-sm font-semibold text-foreground w-20 text-right">
                      {formatCurrency(item.product.priceCents * item.qty)}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart footer */}
          <div className="border-t border-border p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-foreground">
                {formatCurrency(cartTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClearCart}
                disabled={cart.length === 0}
              >
                Limpar
              </Button>
              <Button
                className="flex-1"
                onClick={handleFinalizeSale}
                disabled={cart.length === 0}
              >
                Finalizar Venda (F9)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Barcode Scanner Dialog */}
      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanned={handleBarcodeScanned}
      />

      {/* Checkout Dialog with payments & customer info */}
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        cartTotal={cartTotal}
        onConfirm={confirmSale}
      />

      {/* Clear Cart Dialog */}
      <AlertDialog open={clearCartOpen} onOpenChange={setClearCartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar carrinho?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os itens serao removidos do carrinho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClear}>
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sale Complete Dialog */}
      <Dialog open={saleCompleteOpen} onOpenChange={setSaleCompleteOpen}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Venda Registrada</DialogTitle>
            <DialogDescription>
              A venda foi registrada com sucesso.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
              <ShoppingCart className="size-8 text-primary" />
            </div>
            <p className="text-3xl font-bold text-foreground">
              {formatCurrency(lastSaleTotal)}
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => {
              setSaleCompleteOpen(false)
              searchInputRef.current?.focus()
            }}>
              Nova Venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
