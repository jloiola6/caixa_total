"use client"

import { useState, useCallback, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { formatCurrencyInput, parseCurrencyInput } from "@/lib/format"

interface CurrencyInputProps {
  value: number // cents
  onChange: (cents: number) => void
  id?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CurrencyInput({
  value,
  onChange,
  id,
  placeholder = "0,00",
  className,
  disabled,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(formatCurrencyInput(value))

  useEffect(() => {
    setDisplay(formatCurrencyInput(value))
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const cents = parseCurrencyInput(raw)
      setDisplay(formatCurrencyInput(cents))
      onChange(cents)
    },
    [onChange]
  )

  const handleFocus = useCallback(() => {
    if (value === 0) setDisplay("")
  }, [value])

  const handleBlur = useCallback(() => {
    setDisplay(formatCurrencyInput(value))
  }, [value])

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
