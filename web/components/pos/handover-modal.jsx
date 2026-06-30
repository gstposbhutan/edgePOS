"use client"

import { useState, useEffect, useRef } from "react"
import { X, Search, LogOut, Users, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Logout handover prompt — shown when a cashier signs out with an active shift.
 * Mirrors the desktop handover flow. Three actions:
 *
 *  - Close shift & sign out → onCloseShift() (parent opens the end-shift reconcile
 *    flow, then signs out once it resolves).
 *  - Hand over to another cashier → pick a teammate + password → POST /api/auth/switch.
 *    The shift STAYS OPEN (opened_by unchanged); only the logged-in cashier swaps on a
 *    correct password. A wrong password keeps the current cashier. No cash count here.
 *  - Cancel → close, stay logged in.
 *
 * @param {{ open: boolean, currentUserId?: string|null,
 *   onCloseShift: () => void, onClose: () => void }} props
 */
export function HandoverModal({ open, currentUserId, onCloseShift, onClose }) {
  const [view, setView] = useState('menu') // menu → handover
  const [people, setPeople] = useState([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null) // { id, full_name, email }
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef(null)
  const passwordRef = useRef(null)

  // Reset to the menu whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setView('menu')
      setQ('')
      setSelected(null)
      setPassword('')
      setError('')
    }
  }, [open])

  // Load the store team once the cashier chooses to hand over.
  useEffect(() => {
    if (view !== 'handover') return
    setLoadingPeople(true)
    fetch('/api/pos/salespeople')
      .then(r => (r.ok ? r.json() : { salespeople: [] }))
      .then(d => setPeople((d.salespeople || []).filter(p => p.id !== currentUserId)))
      .catch(() => setPeople([]))
      .finally(() => setLoadingPeople(false))
  }, [view, currentUserId])

  useEffect(() => {
    if (view === 'handover' && !selected) {
      const t = setTimeout(() => searchRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
    if (view === 'handover' && selected) {
      const t = setTimeout(() => passwordRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [view, selected])

  if (!open) return null

  const term = q.trim().toLowerCase()
  const rows = people.filter(p => !term
    || (p.full_name ?? '').toLowerCase().includes(term)
    || (p.email ?? '').toLowerCase().includes(term))

  async function handleSwitch() {
    if (!selected) { setError('Choose a cashier to hand over to'); return }
    if (!selected.email) { setError('This teammate has no login email — ask an owner to set one'); return }
    if (!password) { setError('Enter the cashier’s password'); return }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selected.email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Handover failed')
        setSubmitting(false)
        return
      }
      // Session swapped server-side; the shift stays open. Full reload so the new
      // session context (cookies → user/entity) loads cleanly everywhere.
      window.location.reload()
    } catch (e) {
      setError(e.message || 'Handover failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {view === 'handover' && (
              <button onClick={() => { setView('menu'); setSelected(null); setError('') }} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {view === 'menu' ? 'Shift is still open' : 'Hand over to another cashier'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {view === 'menu' && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              You have an active shift. Close it to account for the drawer, or hand the
              register over to another cashier while keeping the shift open.
            </p>

            <button
              onClick={onCloseShift}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
            >
              <span className="h-9 w-9 rounded-lg bg-tibetan/10 flex items-center justify-center shrink-0">
                <LogOut className="h-4 w-4 text-tibetan" />
              </span>
              <span>
                <span className="block text-sm font-medium">Close shift &amp; sign out</span>
                <span className="block text-xs text-muted-foreground">Count the drawer and end the shift.</span>
              </span>
            </button>

            <button
              onClick={() => setView('handover')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
            >
              <span className="h-9 w-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-gold" />
              </span>
              <span>
                <span className="block text-sm font-medium">Hand over to another cashier</span>
                <span className="block text-xs text-muted-foreground">Keep the shift open; swap the logged-in cashier.</span>
              </span>
            </button>

            <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          </div>
        )}

        {view === 'handover' && (
          <>
            {!selected ? (
              <>
                <div className="p-3 border-b border-border shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
                      placeholder="Search by name…"
                      className="pl-8 h-9"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                  {loadingPeople ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Loading…</p>
                  ) : rows.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">No other cashiers found.</p>
                  ) : rows.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(p); setError('') }}
                      className="w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{p.full_name || 'Unnamed'}</span>
                        {p.email && <span className="block text-[11px] text-muted-foreground truncate">{p.email}</span>}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 ml-2">{p.sub_role}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-5 space-y-4">
                <div className="rounded-lg border border-border px-3 py-2.5 flex items-center justify-between">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{selected.full_name || 'Unnamed'}</span>
                    {selected.email && <span className="block text-[11px] text-muted-foreground truncate">{selected.email}</span>}
                  </span>
                  <button
                    onClick={() => { setSelected(null); setPassword(''); setError('') }}
                    className="text-xs text-primary hover:underline shrink-0 ml-2"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Cashier&apos;s password</label>
                  <Input
                    ref={passwordRef}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSwitch() }}
                    placeholder="••••••••"
                    autoComplete="off"
                  />
                </div>

                {error && <p className="text-xs text-tibetan">{error}</p>}

                <Button className="w-full" onClick={handleSwitch} disabled={submitting}>
                  {submitting ? 'Switching…' : 'Hand over'}
                </Button>
              </div>
            )}

            {/* Inline error on the picker step (e.g. team failed to load). */}
            {!selected && error && (
              <p className="px-5 pb-3 text-xs text-tibetan shrink-0">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
