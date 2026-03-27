"use client"

import { useState, useCallback, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { formatPercentMaskInput, parsePercentMaskInput } from "@/lib/format"

interface PercentInputProps {
  /** Percentual × 100 com 2 decimais implícitos (ex.: 10,5% → 1050). */
  value: number
  onChange: (hundredthsOfPercent: number) => void
  id?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function PercentInput({
  value,
  onChange,
  id,
  placeholder = "0,00",
  className,
  disabled,
}: PercentInputProps) {
  const [display, setDisplay] = useState(() => formatPercentMaskInput(value))

  useEffect(() => {
    setDisplay(formatPercentMaskInput(value))
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      if (raw === "-" || raw === "- ") {
        setDisplay("-")
        onChange(0)
        return
      }
      const v = parsePercentMaskInput(raw)
      setDisplay(formatPercentMaskInput(v))
      onChange(v)
    },
    [onChange]
  )

  const handleFocus = useCallback(() => {
    if (value === 0) setDisplay("")
  }, [value])

  const handleBlur = useCallback(() => {
    setDisplay(formatPercentMaskInput(value))
  }, [value])

  return (
    <div className="relative">
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
        style={{ paddingRight: "2rem" }}
        disabled={disabled}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  )
}
