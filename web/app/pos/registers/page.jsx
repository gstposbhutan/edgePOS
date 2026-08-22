"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Pencil, Trash2, Landmark, Download, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getUser, getRoleClaims } from "@/lib/auth"

// Terminals = cash registers. A register IS a desktop terminal, provisioned when a platform admin
// approves its license request. This page lets the owner rename it, set its mode (POS vs back
// office), and re-download its license key (which rotates the terminal's credentials).
export default function RegistersPage() {
  const router = useRouter()
  const [entityId, setEntityId] = useState(null)
  const [registers, setRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formName, setFormName] = useState('')
  const [formFloat, setFormFloat] = useState('')
  const [formMode, setFormMode] = useState('POS')
  const [saving, setSaving] = useState(false)
  const [busyKey, setBusyKey] = useState(null)   // register id currently re-minting a key

  async function fetchRegisters() {
    setLoading(true)
    const res = await fetch('/api/cash-registers')
    const json = await res.json()
    setRegisters(json.registers || [])
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid, subRole: sr } = getRoleClaims(user)
      if (!['MANAGER', 'OWNER', 'ADMIN'].includes(sr)) { router.push('/pos'); return }
      setEntityId(eid)
      fetchRegisters()
    }
    load()
  }, [])

  function openEdit(reg) {
    setEditing(reg)
    setFormName(reg.name)
    setFormFloat(String(reg.default_opening_float))
    setFormMode(reg.mode || 'POS')
    setShowModal(true)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setSaving(true)
    const res = await fetch(`/api/cash-registers/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: formName.trim(), default_opening_float: parseFloat(formFloat) || 0, mode: formMode }),
    })
    setSaving(false)
    if (res.ok) { setShowModal(false); fetchRegisters() }
  }

  async function handleDeactivate(reg) {
    await fetch(`/api/cash-registers/${reg.id}`, { method: 'DELETE' })
    fetchRegisters()
  }

  async function downloadKey(reg) {
    const ok = window.confirm(
      `Download a new license key for “${reg.name}”?\n\nThis rotates the terminal's credentials — the previously downloaded key stops working and the terminal must re-activate with this new one.`
    )
    if (!ok) return
    setBusyKey(reg.id)
    const res = await fetch(`/api/cash-registers/${reg.id}/license`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setBusyKey(null)
    if (!res.ok) { window.alert(json.error || 'Could not download the license key'); return }
    const blob = new Blob([json.license], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = json.filename || 'terminal.lic'; a.click()
    URL.revokeObjectURL(url)
  }

  const licStatus = (reg) => {
    const l = Array.isArray(reg.license) ? reg.license[0] : reg.license
    if (!l) return { text: 'Not licensed', tone: 'muted' }
    if (!l.is_active) return { text: 'License revoked', tone: 'bad' }
    if (l.expires_at && new Date(l.expires_at) < new Date()) return { text: 'License expired', tone: 'bad' }
    return { text: `Licensed · expires ${new Date(l.expires_at).toLocaleDateString()}`, tone: 'ok', licensed: true }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <span className="text-foreground font-medium">Terminals</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{registers.length} terminal{registers.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/pos/terminals')}>Sync tokens</Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : registers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Landmark className="h-10 w-10 opacity-20" />
            <p className="text-sm">No terminals yet</p>
            <p className="text-xs max-w-xs text-center">A terminal appears here once its license request is approved by the platform admin. Install the desktop app and request a license from its activation screen.</p>
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
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                        {reg.mode === 'BACK_OFFICE' ? 'Back office' : 'POS'}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                        reg.is_active ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {reg.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 ${st.tone === 'bad' ? 'text-tibetan' : 'text-muted-foreground'}`}>
                      {st.text} · float Nu. {parseFloat(reg.default_opening_float).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {st.licensed && (
                      <Button variant="ghost" size="icon-sm" onClick={() => downloadKey(reg)} disabled={busyKey === reg.id} title="Download license key">
                        {busyKey === reg.id ? <KeyRound className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(reg)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {reg.is_active && (
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDeactivate(reg)} title="Deactivate">
                        <Trash2 className="h-4 w-4 text-tibetan" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold mb-4">Edit Terminal</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Terminal name</label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Counter 1" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Mode</label>
                <select value={formMode} onChange={e => setFormMode(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
                  <option value="POS">POS terminal (cash sales)</option>
                  <option value="BACK_OFFICE">Back office (stock only)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Default opening float (Nu.)</label>
                <Input type="number" value={formFloat} onChange={e => setFormFloat(e.target.value)} min="0" step="100" className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? 'Saving...' : 'Update'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
