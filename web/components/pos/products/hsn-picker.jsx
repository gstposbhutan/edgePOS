"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Search, ChevronDown, X } from "lucide-react"
import { Input } from "@/components/ui/input"

const SELECT_CLS = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * Searchable / filterable HSN-code picker, backed by GET /api/hsn.
 * Selecting a code fills the product's hsn_code — the DB triggers then derive
 * category / subcategory / GST from hsn_master automatically on save.
 *
 * @param {{ value: string, onChange: (code: string, row: object|null) => void, required?: boolean }} props
 */
export function HsnPicker({ value, onChange, required }) {
  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState("")
  const [chapter,  setChapter]  = useState("")
  const [category, setCategory] = useState("")
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState(null)   // resolved hsn_master row for the current value
  const [facets,   setFacets]   = useState({ chapters: [], categories: [] })
  const boxRef = useRef(null)

  // Load the filter facets once.
  useEffect(() => {
    fetch('/api/hsn?facets=1')
      .then(r => r.ok ? r.json() : { chapters: [], categories: [] })
      .then(d => setFacets({ chapters: d.chapters || [], categories: d.categories || [] }))
      .catch(() => {})
  }, [])

  // Resolve the current value's description (edit mode, or after an external set e.g. AI enrich).
  useEffect(() => {
    if (!value) { setSelected(null); return }
    if (selected?.code === value) return
    fetch('/api/hsn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: [value] }),
    })
      .then(r => r.ok ? r.json() : { hsn_codes: [] })
      .then(d => setSelected(d.hsn_codes?.[0] || { code: value }))
      .catch(() => setSelected({ code: value }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Debounced search whenever the dropdown is open and the query/filters change.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const qs = new URLSearchParams()
        if (query)    qs.set('q', query)
        if (chapter)  qs.set('chapter', chapter)
        if (category) qs.set('category', category)
        qs.set('limit', '50')
        const r = await fetch(`/api/hsn?${qs.toString()}`)
        const d = r.ok ? await r.json() : { hsn_codes: [] }
        setResults(d.hsn_codes || [])
      } catch { setResults([]) } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [open, query, chapter, category])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(row) {
    setSelected(row)
    onChange(row.code, row)
    setOpen(false)
    setQuery("")
  }

  function clear(e) {
    e.stopPropagation()
    setSelected(null)
    onChange("", null)
  }

  return (
    <div className="relative" ref={boxRef}>
      {/* Trigger */}
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center justify-between gap-2 h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-left outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {selected?.code ? (
            <span className="truncate">
              <span className="font-mono font-medium text-foreground">{selected.code}</span>
              {(selected.short_description || selected.description) && (
                <span className="text-muted-foreground"> — {selected.short_description || selected.description}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Search HSN code…</span>
          )}
          <span className="flex items-center gap-1 shrink-0">
            {selected?.code && (
              <span
                role="button"
                tabIndex={-1}
                onClick={clear}
                className="rounded p-0.5 text-muted-foreground hover:text-tibetan hover:bg-muted/60"
                aria-label="Clear HSN code"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-60" />
          </span>
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          {/* Search + filters */}
          <div className="p-2 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search code, description or category…"
                className="pl-7 h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={chapter} onChange={e => setChapter(e.target.value)} className={SELECT_CLS}>
                <option value="">All chapters</option>
                {facets.chapters.map(c => <option key={c} value={c}>Ch. {c}</option>)}
              </select>
              <select value={category} onChange={e => setCategory(e.target.value)} className={SELECT_CLS}>
                <option value="">All categories</option>
                {facets.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No matching HSN codes</div>
            ) : (
              results.map(row => (
                <button
                  type="button"
                  key={row.id || row.code}
                  onClick={() => pick(row)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted/50 border-b border-border/50 last:border-0 ${selected?.code === row.code ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-foreground">{row.code}</span>
                    {row.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{row.category}</span>
                    )}
                    {row.sales_tax != null && (
                      <span className="text-[10px] text-muted-foreground">GST {row.sales_tax}%</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {row.short_description || row.description}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
