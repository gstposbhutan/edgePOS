"use client"

import { useState, useEffect, useRef } from "react"
import { Search, ChevronDown, X, Plus, Check } from "lucide-react"
import { Input } from "@/components/ui/input"

/**
 * Brand / manufacturer combobox — select an existing brand for this shop, or add a new
 * unique one. Existing brands come from GET /api/products/brands (distinct per entity).
 * "Add new" only appears when the typed name isn't already a brand (case-insensitive).
 *
 * @param {{ value: string, onChange: (brand: string) => void }} props
 */
export function BrandPicker({ value, onChange }) {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState("")
  const [brands,  setBrands]  = useState([])
  const boxRef = useRef(null)

  useEffect(() => {
    fetch('/api/products/brands')
      .then(r => r.ok ? r.json() : { brands: [] })
      .then(d => setBrands(Array.isArray(d.brands) ? d.brands : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim()
  const filtered = q
    ? brands.filter(b => b.toLowerCase().includes(q.toLowerCase()))
    : brands
  const exactExists = brands.some(b => b.toLowerCase() === q.toLowerCase())
  const canAdd = q.length > 0 && !exactExists

  function pick(brand) {
    onChange(brand)
    // Keep it locally so it shows immediately even before a refetch.
    if (brand && !brands.some(b => b.toLowerCase() === brand.toLowerCase())) {
      setBrands(prev => [...prev, brand].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
    }
    setQuery("")
    setOpen(false)
  }

  function clear(e) {
    e.stopPropagation()
    onChange("")
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-left outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {value
          ? <span className="truncate text-foreground">{value}</span>
          : <span className="text-muted-foreground">Select or add brand…</span>}
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={clear}
              className="rounded p-0.5 text-muted-foreground hover:text-tibetan hover:bg-muted/60"
              aria-label="Clear brand"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); pick(q) } }}
                placeholder="Search or type a new brand…"
                className="pl-7 h-8"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {canAdd && (
              <button
                type="button"
                onClick={() => pick(q)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 border-b border-border/50"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                <span>Add "<span className="font-medium text-foreground">{q}</span>"</span>
              </button>
            )}
            {filtered.length === 0 && !canAdd ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {brands.length === 0 ? 'No brands yet — type to add one' : 'No matching brands'}
              </div>
            ) : (
              filtered.map(b => (
                <button
                  type="button"
                  key={b}
                  onClick={() => pick(b)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 border-b border-border/50 last:border-0"
                >
                  <span className="truncate text-foreground">{b}</span>
                  {value === b && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
