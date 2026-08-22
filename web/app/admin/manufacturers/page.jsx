'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2, Merge, Search, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Normalise a brand for duplicate detection: lowercase, strip diacritics + punctuation,
// collapse whitespace. "Nestlé", "Nestle", "nestle." all → "nestle".
function normalize(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

export default function ManufacturersPage() {
  const [items,    setItems]    = useState([])   // [{ brand, count }]
  const [loading,  setLoading]  = useState(true)
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState(new Set())
  const [canonical, setCanonical] = useState('')
  const [customName, setCustomName] = useState('')
  const [busy,     setBusy]     = useState(false)
  const [msg,      setMsg]      = useState(null)

  useEffect(() => { fetchList() }, [])

  async function fetchList() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/manufacturers')
      const data = res.ok ? await res.json() : { manufacturers: [] }
      setItems(data.manufacturers || [])
    } catch { /* noop */ } finally { setLoading(false) }
  }

  // Auto-detected duplicate groups: brands that normalise to the same key, ≥2 distinct variants.
  const dupeGroups = useMemo(() => {
    const byKey = new Map()
    for (const it of items) {
      const k = normalize(it.brand)
      if (!k) continue
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(it)
    }
    return [...byKey.values()]
      .filter(g => g.length > 1)
      .map(g => [...g].sort((a, b) => b.count - a.count))   // most-used first (default canonical)
      .sort((a, b) => a[0].brand.localeCompare(b[0].brand))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter(i => i.brand.toLowerCase().includes(q)) : items
  }, [items, query])

  const selectedBrands = useMemo(() => [...selected], [selected])

  function toggle(brand) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(brand) ? next.delete(brand) : next.add(brand)
      return next
    })
    setMsg(null)
  }

  // Default the canonical target to the highest-count selected brand.
  useEffect(() => {
    if (selectedBrands.length && !selectedBrands.includes(canonical)) {
      const top = [...items]
        .filter(i => selected.has(i.brand))
        .sort((a, b) => b.count - a.count)[0]
      setCanonical(top?.brand || '')
    }
    if (selectedBrands.length === 0) { setCanonical(''); setCustomName('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrands.length])

  async function doMerge(from, into) {
    if (!into || from.filter(b => b !== into).length === 0) {
      setMsg({ type: 'error', text: 'Pick a canonical name and at least one other variant.' })
      return
    }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, into }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Merge failed')
      setMsg({ type: 'ok', text: `Merged ${data.updated} product(s) into "${data.into}".` })
      setSelected(new Set())
      await fetchList()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setBusy(false) }
  }

  const mergeTarget = customName.trim() || canonical

  return (
    <div className="p-2 md:p-4 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-serif font-bold">Manufacturers</h1>
        <p className="text-sm text-muted-foreground">
          The shared brand / manufacturer list across all vendors, wholesalers &amp; distributors.
          Merge duplicates created after a brand already existed.
        </p>
      </div>

      {msg && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${msg.type === 'ok' ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-tibetan/30 bg-tibetan/5 text-tibetan'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Auto-detected possible duplicates */}
          {dupeGroups.length > 0 && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="font-semibold text-sm">Possible duplicates ({dupeGroups.length})</h2>
              </div>
              <div className="space-y-3">
                {dupeGroups.map((group, i) => {
                  const target = group[0].brand   // highest count
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        {group.map((g, j) => (
                          <span key={g.brand} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${g.brand === target ? 'bg-primary/10 text-foreground font-medium' : 'bg-muted text-muted-foreground'}`}>
                            {g.brand} <span className="opacity-60">({g.count})</span>
                            {j < group.length - 1 && <span className="ml-1 opacity-40">·</span>}
                          </span>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => doMerge(group.map(g => g.brand), target)}
                        className="shrink-0"
                      >
                        <Merge className="h-3.5 w-3.5 mr-1.5" />
                        Merge into "{target}"
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search manufacturers…" className="pl-8" />
          </div>

          {/* Manual multi-select merge bar */}
          {selectedBrands.length >= 2 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">{selectedBrands.length} selected → merge into</span>
              <select
                value={customName ? '' : canonical}
                onChange={e => { setCanonical(e.target.value); setCustomName('') }}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {selectedBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">or</span>
              <Input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="type a new name"
                className="h-8 w-40"
              />
              <Button size="sm" disabled={busy || !mergeTarget} onClick={() => doMerge(selectedBrands, mergeTarget)}>
                {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Merge className="h-3.5 w-3.5 mr-1.5" />}
                Merge
              </Button>
              <button className="text-xs text-muted-foreground hover:text-foreground ml-1" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          )}

          {/* List */}
          <div className="rounded-lg border border-border divide-y divide-border">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {items.length === 0 ? 'No manufacturers yet.' : 'No matches.'}
              </div>
            ) : (
              filtered.map(it => (
                <label key={it.brand} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(it.brand)}
                    onChange={() => toggle(it.brand)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="flex-1 text-sm text-foreground">{it.brand}</span>
                  <span className="text-xs text-muted-foreground">{it.count} product{it.count === 1 ? '' : 's'}</span>
                </label>
              ))
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {items.length} manufacturer{items.length === 1 ? '' : 's'} · select 2+ to merge manually.
          </p>
        </>
      )}
    </div>
  )
}
