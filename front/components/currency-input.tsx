"use client"

import { useState, useCallback, useEffect } from "react"
import { Input } from "@/components/ui/input"
import {
  formatCurrencyInput,
  parseCurrencyInput,
  formatSignedCurrencyInput,
  parseSignedCurrencyInput,
} from "@/lib/format"

interface CurrencyInputProps {
  value: number // cents
  onChange: (cents: number) => void
  id?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Permite valores negativos (ex.: subtrair reais em lote). */
  allowNegative?: boolean
}

export function CurrencyInput({
  value,
  onChange,
  id,
  placeholder = "0,00",
  className,
  disabled,
  allowNegative = false,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() =>
    allowNegative ? formatSignedCurrencyInput(value) : formatCurrencyInput(value)
  )

  useEffect(() => {
    setDisplay(
      allowNegative ? formatSignedCurrencyInput(value) : formatCurrencyInput(value)
    )
  }, [value, allowNegative])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (allowNegative && (raw === "-" || raw === "- ")) {
        setDisplay("-")
        onChange(0)
        return
      }
      const cents = allowNegative ? parseSignedCurrencyInput(raw) : parseCurrencyInput(raw)
      setDisplay(allowNegative ? formatSignedCurrencyInput(cents) : formatCurrencyInput(cents))
      onChange(cents)
    },
    [allowNegative, onChange]
  )

  const handleFocus = useCallback(() => {
    if (value === 0) setDisplay("")
  }, [value])

  const handleBlur = useCallback(() => {
    setDisplay(
      allowNegative ? formatSignedCurrencyInput(value) : formatCurrencyInput(value)
    )
  }, [value, allowNegative])

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        style={{ paddingLeft: "2.5rem" }}
        disabled={disabled}
      />
    </div>
  )
}
