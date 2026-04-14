"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/types"

export type ProductFilters = {
  categories: string[]
  brands: string[]
  models: string[]
  sizes: string[]
  colors: string[]
  controlNumbers: string[]
}

export type ProductFilterOptions = ProductFilters

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  categories: [],
  brands: [],
  models: [],
  sizes: [],
  colors: [],
  controlNumbers: [],
}

function cloneFilters(filters: ProductFilters): ProductFilters {
  return {
    categories: [...filters.categories],
    brands: [...filters.brands],
    models: [...filters.models],
    sizes: [...filters.sizes],
    colors: [...filters.colors],
    controlNumbers: [...filters.controlNumbers],
  }
}

function toggleOption(list: string[], option: string, checked: boolean): string[] {
  if (checked) {
    if (list.includes(option)) return list
    return [...list, option]
  }
  return list.filter((item) => item !== option)
}

function formatFilterOption(keyName: keyof ProductFilters, option: string): string {
  if (keyName === "categories") {
    return PRODUCT_CATEGORY_LABELS[option as ProductCategory] ?? option
  }
  return option
}

export function countActiveProductFilters(filters: ProductFilters): number {
  return Object.values(filters).reduce((acc, values) => acc + values.length, 0)
}

type FilterSectionProps = {
  title: string
  keyName: keyof ProductFilters
  options: string[]
  selected: string[]
  onToggle: (option: string, checked: boolean) => void
  onClear: () => void
}

function selectedSummary(keyName: keyof ProductFilters, selected: string[]): string {
  if (selected.length === 0) return "Selecione uma ou mais opcoes"
  if (selected.length <= 2) {
    return selected.map((value) => formatFilterOption(keyName, value)).join(", ")
  }
  return `${selected.length} selecionados`
}

function FilterSelect({
  title,
  keyName,
  options,
  selected,
  onToggle,
  onClear,
}: FilterSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-left">{selectedSummary(keyName, selected)}</span>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selected.length}/{options.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onClear}
              disabled={selected.length === 0}
            >
              Limpar
            </Button>
          </div>

          {options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma opcao cadastrada.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto p-2">
              <div className="space-y-1">
                {options.map((option, index) => {
                  const inputId = `${keyName}-${index}`
                  const checked = selected.includes(option)
                  return (
                    <label
                      key={`${keyName}-${option}`}
                      htmlFor={inputId}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(value) => onToggle(option, value === true)}
                      />
                      <span className="truncate" title={formatFilterOption(keyName, option)}>
                        {formatFilterOption(keyName, option)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

type ProductFiltersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: ProductFilters
  options: ProductFilterOptions
  onApply: (filters: ProductFilters) => void
}

export function ProductFiltersDialog({
  open,
  onOpenChange,
  value,
  options,
  onApply,
}: ProductFiltersDialogProps) {
  const [draft, setDraft] = useState<ProductFilters>(() => cloneFilters(value))

  useEffect(() => {
    if (open) {
      setDraft(cloneFilters(value))
    }
  }, [open, value])

  const totalOptions = useMemo(() => {
    return Object.values(options).reduce((acc, values) => acc + values.length, 0)
  }, [options])

  const activeCount = countActiveProductFilters(draft)

  function handleToggle(keyName: keyof ProductFilters, option: string, checked: boolean) {
    setDraft((prev) => ({
      ...prev,
      [keyName]: toggleOption(prev[keyName], option, checked),
    }))
  }

  function handleClearAll() {
    setDraft(cloneFilters(EMPTY_PRODUCT_FILTERS))
  }

  function handleApply() {
    onApply(cloneFilters(draft))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[86svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtros de produtos</DialogTitle>
          <DialogDescription>
            Selecione uma ou mais opcoes para combinar filtros. So aparecem valores ja cadastrados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtros selecionados:</span>
            <Badge variant="secondary">{activeCount}</Badge>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleClearAll}>
            Limpar tudo
          </Button>
        </div>

        {totalOptions === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nao ha opcoes de filtro porque ainda nao existem produtos cadastrados.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
              <FilterSelect
                title="Categoria"
                keyName="categories"
                options={options.categories}
                selected={draft.categories}
                onToggle={(option, checked) => handleToggle("categories", option, checked)}
                onClear={() =>
                  setDraft((prev) => ({
                    ...prev,
                    categories: [],
                  }))
                }
              />
              <FilterSelect
                title="Marca"
                keyName="brands"
                options={options.brands}
                selected={draft.brands}
                onToggle={(option, checked) => handleToggle("brands", option, checked)}
                onClear={() =>
                  setDraft((prev) => ({
                    ...prev,
                    brands: [],
                  }))
                }
              />
              <FilterSelect
                title="Modelo"
                keyName="models"
                options={options.models}
                selected={draft.models}
                onToggle={(option, checked) => handleToggle("models", option, checked)}
                onClear={() =>
                  setDraft((prev) => ({
                    ...prev,
                    models: [],
                  }))
                }
              />
              <FilterSelect
                title="Tamanho"
                keyName="sizes"
                options={options.sizes}
                selected={draft.sizes}
                onToggle={(option, checked) => handleToggle("sizes", option, checked)}
                onClear={() =>
                  setDraft((prev) => ({
                    ...prev,
                    sizes: [],
                  }))
                }
              />
              <FilterSelect
                title="Cor"
                keyName="colors"
                options={options.colors}
                selected={draft.colors}
                onToggle={(option, checked) => handleToggle("colors", option, checked)}
                onClear={() =>
                  setDraft((prev) => ({
                    ...prev,
                    colors: [],
                  }))
                }
              />
              <FilterSelect
                title="Numeracao do Controle"
                keyName="controlNumbers"
                options={options.controlNumbers}
                selected={draft.controlNumbers}
                onToggle={(option, checked) => handleToggle("controlNumbers", option, checked)}
                onClear={() =>
                  setDraft((prev) => ({
                    ...prev,
                    controlNumbers: [],
                  }))
                }
              />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleApply}>
            Aplicar filtros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
