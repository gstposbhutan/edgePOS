"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, Landmark, Pencil, Trash2, Download, KeyRound, Loader2, X, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Terminals for the distributor / wholesaler consoles. A terminal is a cash_register — the desktop
 * app, provisioned when a platform admin approves its license request (which forces BACK_OFFICE mode
 * for the tiers). Reuses the entity-scoped /api/cash-registers routes. The owner/manager can rename a
 * terminal, re-download (rotate) its license key, and deactivate it. Issuing a license stays with the
 * platform admin — a terminal shows up here after approval.
 */
export function TerminalsManager() {
  const [registers, setRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cash-registers')
      const data = await res.json()
      if (res.ok) setRegisters(data.registers || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const licStatus = (reg) => {
    const l = Array.isArray(reg.license) ? reg.license[0] : reg.license
    if (!l) return { text: 'Not licensed', tone: 'muted' }
    if (!l.is_active) return { text: 'License revoked', tone: 'bad' }
    if (l.expires_at && new Date(l.expires_at) < new Date()) return { text: 'License expired', tone: 'bad' }
    return { text: `Licensed · expires ${new Date(l.expires_at).toLocaleDateString()}`, tone: 'ok', licensed: true }
  }

  async function save() {
    if (!formName.trim()) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/cash-registers/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEditing(null); setNotice('Terminal renamed'); load()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  async function deactivate(reg) {
    if (!window.confirm(`Deactivate “${reg.name}”? It will stop syncing until re-activated.`)) return
    setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/cash-registers/${reg.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setNotice('Terminal deactivated'); load()
    } catch (err) { setError(err.message) }
  }

  async function downloadKey(reg) {
    if (!window.confirm(`Download a new license key for “${reg.name}”?\n\nThis rotates the terminal's credentials — the previous key stops working and the terminal must re-activate with this one.`)) return
    setBusyKey(reg.id); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/cash-registers/${reg.id}/license`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not download the license key')
      const blob = new Blob([data.license], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = data.filename || 'terminal.lic'; a.click()
      URL.revokeObjectURL(url)
      setNotice('New license key downloaded — activate the terminal with it')
    } catch (err) { setError(err.message) } finally { setBusyKey(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-serif font-bold text-foreground">Terminals</h2>
          <p className="text-xs text-muted-foreground">{registers.length} back-office terminal{registers.length === 1 ? '' : 's'}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {error && <div className="p-3 bg-tibetan/10 border border-tibetan/30 rounded-lg flex items-start gap-2"><AlertCircle className="h-4 w-4 text-tibetan shrink-0 mt-0.5" /><p className="text-sm text-tibetan">{error}</p></div>}
      {notice && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /><p className="text-sm text-emerald-600">{notice}</p></div>}

      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : registers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Landmark className="h-12 w-12 opacity-20" />
            <p className="text-sm">No terminals yet</p>
            <p className="text-xs max-w-xs text-center">Install the desktop app on a warehouse machine and request a license from its activation screen. Once the platform admin approves it, the terminal appears here (in back-office mode).</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {registers.map(reg => {
              const st = licStatus(reg)
              return (
                <div key={reg.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">{reg.name}</p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">Back office</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${reg.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>{reg.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <p className={`text-xs mt-0.5 ${st.tone === 'bad' ? 'text-tibetan' : 'text-muted-foreground'}`}>{st.text}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {st.licensed && (
                      <Button variant="ghost" size="icon-sm" onClick={() => downloadKey(reg)} disabled={busyKey === reg.id} title="Download license key">
                        {busyKey === reg.id ? <KeyRound className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(reg); setFormName(reg.name); setError(null); setNotice(null) }} title="Rename"><Pencil className="h-4 w-4" /></Button>
                    {reg.is_active && <Button variant="ghost" size="icon-sm" onClick={() => deactivate(reg)} title="Deactivate"><Trash2 className="h-4 w-4 text-tibetan" /></Button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-serif font-bold">Rename terminal</h3><button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
            <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Thimphu warehouse desk" />
            <Button onClick={save} disabled={saving || !formName.trim()} className="w-full">{saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Rename'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
