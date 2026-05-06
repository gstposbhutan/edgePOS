"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Pencil, Trash2, Landmark } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getUser, getRoleClaims } from "@/lib/auth"
import { createClient } from "@/lib/supabase/client"

export default function RegistersPage() {
  const router = useRouter()
  const [entityId, setEntityId] = useState(null)
  const [subRole, setSubRole] = useState(null)
  const [registers, setRegisters] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formName, setFormName] = useState('')
  const [formFloat, setFormFloat] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return router.push('/login')
      const { entityId: eid, subRole: sr } = getRoleClaims(user)
      if (!['MANAGER', 'OWNER', 'ADMIN'].includes(sr)) {
        router.push('/pos')
        return
      }
      setEntityId(eid)
      setSubRole(sr)
      fetchRegisters(eid)
    }
    load()
  }, [])

  async function fetchRegisters(eid) {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/cash-registers', {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    const json = await res.json()
    setRegisters(json.registers || [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setFormName('')
    setFormFloat('0')
    setShowModal(true)
  }

  function openEdit(reg) {
    setEditing(reg)
    setFormName(reg.name)
    setFormFloat(String(reg.default_opening_float))
    setShowModal(true)
  }

  async function handleSave() {
    if (!formName.trim()) return
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session.access_token
    const body = { name: formName.trim(), default_opening_float: parseFloat(formFloat) || 0 }

    let res
    if (editing) {
      res = await fetch(`/api/cash-registers/${editing.id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      res = await fetch('/api/cash-registers', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    setSaving(false)
    if (res.ok) {
      setShowModal(false)
      fetchRegisters(entityId)
    }
  }

  async function handleDeactivate(reg) {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/cash-registers/${reg.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    fetchRegisters(entityId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glassmorphism border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <button onClick={() => router.push('/pos')} className="hover:text-foreground transition-colors">POS</button>
            <span>/</span>
            <span className="text-foreground font-medium">Cash Registers</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{registers.length} register{registers.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Register
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : registers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Landmark className="h-10 w-10 opacity-20" />
            <p className="text-sm">No cash registers yet</p>
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Create Register</Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {registers.map(reg => (
              <div key={reg.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium">{reg.name}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      reg.is_active
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}>
                      {reg.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Default float: Nu. {parseFloat(reg.default_opening_float).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
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
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold mb-4">{editing ? 'Edit Register' : 'New Cash Register'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Register Name</label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Counter 1" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Default Opening Float (Nu.)</label>
                <Input type="number" value={formFloat} onChange={e => setFormFloat(e.target.value)} min="0" step="100" className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
