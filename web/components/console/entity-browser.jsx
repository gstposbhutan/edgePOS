"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Star, Loader2, Building2, Phone, MapPin, RefreshCw, Link2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

/**
 * Shared network-discovery list for the vendor consoles. Drives both:
 *   • browse mode — search the platform for active entities of `targetRole` and star the
 *     ones you want to keep (GET /api/console/browse, POST/DELETE /api/console/favourites)
 *   • saved mode  — your favourites with an un-star action (GET /api/console/favourites)
 *
 * Rows carry two independent flags from the API: `is_favourite` (a private bookmark) and, when the
 * pair forms a real commercial relationship (`linkable`), `is_linked` — an active supply link in the
 * B2B junction. The star bookmarks; the "Connect" action creates/removes the supply link (and, for a
 * new link, auto-provisions the B2B khata). Both are optimistic and roll back on failure.
 *
 * Props:
 *   mode        — 'browse' | 'saved'
 *   targetRole  — 'WHOLESALER' | 'RETAILER' (browse mode only)
 *   title       — section heading
 *   subtitle    — short caption under the heading
 */
export function EntityBrowser({ mode, targetRole, title, subtitle }) {
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [busyId,   setBusyId]   = useState(null)  // entity id mid-favourite (disables its star)
  const [linkBusy, setLinkBusy] = useState(null)  // entity id mid-connect (disables its Connect btn)
  const reqId = useRef(0)                          // guards against out-of-order search responses

  const load = useCallback(async (term) => {
    const myReq = ++reqId.current
    setLoading(true)
    try {
      const url = mode === 'saved'
        ? '/api/console/favourites'
        : `/api/console/browse?role=${encodeURIComponent(targetRole)}${term ? `&search=${encodeURIComponent(term)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (myReq !== reqId.current) return // a newer search already superseded this one
      if (res.ok) {
        setRows(mode === 'saved'
          ? (data.favourites ?? []).map(f => ({ ...f, is_favourite: true }))
          : (data.entities ?? []))
      }
    } catch {
      // leave the current list in place on a transient error
    }
    if (myReq === reqId.current) setLoading(false)
  }, [mode, targetRole])

  // Initial load, plus a debounced reload as the search term changes (browse only).
  useEffect(() => {
    if (mode === 'saved') { load(); return }
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [mode, search, load])

  async function toggleFavourite(row) {
    const wasFav = row.is_favourite
    setBusyId(row.id)

    if (mode === 'saved' && wasFav) {
      // Un-starring from the Saved list drops the row entirely.
      setRows(prev => prev.filter(r => r.id !== row.id))
    } else {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_favourite: !wasFav } : r))
    }

    try {
      const res = wasFav
        ? await fetch(`/api/console/favourites?target_entity_id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
        : await fetch('/api/console/favourites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_entity_id: row.id }),
          })
      if (!res.ok) throw new Error('request failed')
    } catch {
      // Roll back the optimistic change.
      if (mode === 'saved' && wasFav) {
        load() // simplest correct rollback for a removed row — refetch the saved list
      } else {
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_favourite: wasFav } : r))
      }
    } finally {
      setBusyId(null)
    }
  }

  async function toggleLink(row) {
    const wasLinked = row.is_linked
    setLinkBusy(row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_linked: !wasLinked } : r))
    try {
      const res = wasLinked
        ? await fetch(`/api/console/links?target_entity_id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
        : await fetch('/api/console/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_entity_id: row.id }),
          })
      if (!res.ok) throw new Error('request failed')
    } catch {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_linked: wasLinked } : r))
    } finally {
      setLinkBusy(null)
    }
  }

  const emptyMsg = mode === 'saved'
    ? 'Nothing saved yet — star a business while browsing to keep it here.'
    : search.trim()
      ? 'No matches.'
      : 'No active businesses to show.'

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-serif font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => load(mode === 'saved' ? undefined : search)} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Search (browse only) */}
      {mode !== 'saved' && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by business name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* List */}
      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Building2 className="h-12 w-12 opacity-20" />
            <p className="text-sm text-center max-w-xs">{emptyMsg}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(row => (
              <EntityRow
                key={row.id}
                row={row}
                showRole={mode === 'saved'}
                busy={busyId === row.id}
                linkBusy={linkBusy === row.id}
                onToggle={() => toggleFavourite(row)}
                onToggleLink={() => toggleLink(row)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EntityRow({ row, showRole, busy, linkBusy, onToggle, onToggleLink }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      {/* Logo / monogram */}
      <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
        {row.marketplace_logo_url
          ? <img src={row.marketplace_logo_url} alt="" className="h-full w-full object-cover" />
          : <Building2 className="h-5 w-5 text-muted-foreground" />}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
          {showRole && row.role && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.role}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
          {row.whatsapp_no && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.whatsapp_no}</span>}
          {row.address && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{row.address}</span>}
          {row.tpn_gstin && <span>TPN: {row.tpn_gstin}</span>}
        </div>
      </div>

      {/* Connect (supply link) — only for pairs that form a real commercial relationship */}
      {row.linkable && (
        <Button
          variant={row.is_linked ? 'secondary' : 'outline'}
          size="sm"
          onClick={onToggleLink}
          disabled={linkBusy}
          title={row.is_linked ? 'Connected — click to disconnect' : 'Connect as a supplier/buyer'}
          className={`shrink-0 ${row.is_linked ? 'text-emerald' : ''}`}
        >
          {linkBusy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : row.is_linked
              ? <><Check className="h-4 w-4 mr-1" /> Connected</>
              : <><Link2 className="h-4 w-4 mr-1" /> Connect</>}
        </Button>
      )}

      {/* Favourite toggle */}
      <button
        onClick={onToggle}
        disabled={busy}
        title={row.is_favourite ? 'Remove from saved' : 'Save'}
        className={`shrink-0 transition-colors disabled:opacity-50 ${row.is_favourite ? 'text-gold' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {busy
          ? <Loader2 className="h-5 w-5 animate-spin" />
          : <Star className="h-5 w-5" fill={row.is_favourite ? 'currentColor' : 'none'} />}
      </button>
    </div>
  )
}
