"use client"

import { useState, useEffect } from "react"
import { OfficeShell } from "@/components/pos/office/office-shell"
import { OfficeGrid } from "@/components/pos/office/office-grid"
import { MASTER_KEYS, withHandlers } from "@/lib/pos/office-keys"
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

  // The terminal register (spec WF-09) — which tills exist, and whether each may still ring.
  //
  // The question an owner brings here is "is that till going to work tomorrow", which is the
  // licence column: not licensed, revoked, expired, or an expiry date. That is a column read, so
  // it gets a column rather than a sentence under the name.
  const rows = registers.map(reg => {
    const st = licStatus(reg)
    return {
      id: reg.id,
      _reg: reg,
      _licensed: !!st.licensed,
      name: reg.name,
      mode: reg.mode === 'BACK_OFFICE' ? 'Back office' : 'POS',
      active: reg.is_active ? 'Active' : 'Inactive',
      licence: st.text,
      float: parseFloat(reg.default_opening_float ?? 0).toFixed(2),
    }
  })

  const COLUMNS = [
    { key: 'name',    label: 'Terminal', width: 220 },
    { key: 'mode',    label: 'Mode',     width: 110 },
    { key: 'active',  label: 'Status',   width: 90 },
    { key: 'licence', label: 'Licence' },   // no width: absorbs the slack
    { key: 'float',   label: 'Opening Float', width: 120, align: 'right' },
    { key: '_act', label: '', width: 150, render: (_v, row) => (
      <span className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        {row._licensed && (
          <button type="button" className="underline" disabled={busyKey === row.id}
            onClick={() => downloadKey(row._reg)}>
            {busyKey === row.id ? 'Key…' : 'Key'}
          </button>
        )}
        <button type="button" className="underline" onClick={() => openEdit(row._reg)}>Edit</button>
        {row._reg.is_active && (
          <button type="button" className="underline" onClick={() => handleDeactivate(row._reg)}>Deactivate</button>
        )}
      </span>
    ) },
  ]

  return (
    <OfficeShell
      crumb="Financial Management"
      title="Terminal Register"
      keys={[
        { key: 'S', label: 'Sync Tokens', onClick: () => router.push('/pos/terminals') },
        ...withHandlers(MASTER_KEYS, {}).filter(k => k.key === 'Esc'),
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <span className="opacity-75">
          {registers.length} terminal{registers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <p className="text-[12px] opacity-60 p-4">Loading…</p>
      ) : (
        <OfficeGrid
          columns={COLUMNS}
          rows={rows}
          empty="No terminals yet. A terminal appears here once its licence request is approved by the platform admin — install the desktop app and request a licence from its activation screen."
        />
      )}

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
    </OfficeShell>
  )
}
