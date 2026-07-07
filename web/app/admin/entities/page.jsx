'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Building2, Plus, X, Loader2 } from 'lucide-react'

const ROLES = ['DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER']

export default function AdminEntitiesPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [entities, setEntities] = useState([])
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }
      const { role } = getRoleClaims(user)
      if (role !== 'SUPER_ADMIN') { router.push('/admin'); return }  // /admin entities = super-admin only
      await load()
      setReady(true)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const res = await fetch('/api/admin/entities')
    if (res.ok) { const j = await res.json(); setEntities(j.entities || []) }
  }

  async function toggleActive(e) {
    await fetch(`/api/admin/entities/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !e.is_active }),
    })
    load()
  }

  // Promote / demote a shop in the public marketplace catalog (featured = visible to shoppers).
  async function toggleFeatured(e) {
    await fetch(`/api/admin/entities/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_featured: !e.is_featured }),
    })
    load()
  }

  // Admin can enable/disable email notifications for any entity (in-app always stays on).
  async function toggleEmailNotifs(e) {
    await fetch(`/api/admin/entities/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_notifications_enabled: !e.email_notifications_enabled }),
    })
    load()
  }

  if (!ready) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Entities</h1>
          <p className="text-sm text-muted-foreground">{entities.length} across the platform</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Entity</Button>
      </div>

      {ROLES.map((role) => {
        const items = entities.filter((e) => e.role === role)
        return (
          <div key={role} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{role} <span className="text-xs">({items.length})</span></h2>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">None</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((e) => (
                  <div key={e.id} className="border border-border rounded-xl p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm">{e.name}</p>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className={e.is_active ? 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10 text-xs' : 'text-xs text-muted-foreground'}>
                          {e.is_active ? 'Active' : 'Suspended'}
                        </Badge>
                        {e.role === 'RETAILER' && e.is_featured && (
                          <Badge variant="outline" className="text-gold border-gold/30 bg-gold/10 text-xs">★ Featured</Badge>
                        )}
                      </div>
                    </div>
                    {e.tpn_gstin && <p className="text-xs text-muted-foreground">TPN: {e.tpn_gstin}</p>}
                    {e.whatsapp_no && <p className="text-xs text-muted-foreground">{e.whatsapp_no}</p>}
                    <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => toggleActive(e)}>
                      {e.is_active ? 'Suspend' : 'Reactivate'}
                    </Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => toggleEmailNotifs(e)}>
                      {e.email_notifications_enabled ? 'Disable email alerts' : 'Enable email alerts'}
                    </Button>
                    {e.role === 'RETAILER' && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => toggleFeatured(e)}>
                        {e.is_featured ? 'Remove from marketplace' : 'Feature on marketplace'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {modalOpen && <AddEntityModal onClose={() => setModalOpen(false)} onAdded={() => { load(); setModalOpen(false) }} />}
    </div>
  )
}

function AddEntityModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', role: 'RETAILER', tpn_gstin: '', whatsapp_no: '', address: '', credit_limit: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }))

  async function submit(ev) {
    ev.preventDefault(); setLoading(true); setError(null)
    const res = await fetch('/api/admin/entities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json(); setLoading(false)
    if (!res.ok) { setError(data.error); return }
    onAdded(data.entity)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-xl p-6 w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add Entity</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input value={form.name} onChange={set('name')} placeholder="Business name *" required />
          <select value={form.role} onChange={set('role')} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Input value={form.tpn_gstin} onChange={set('tpn_gstin')} placeholder="TPN / GSTIN" />
          <Input value={form.whatsapp_no} onChange={set('whatsapp_no')} placeholder="WhatsApp +975…" />
          <Input value={form.address} onChange={set('address')} placeholder="Address" />
          <Input type="number" value={form.credit_limit} onChange={set('credit_limit')} placeholder="Credit limit (Nu.)" />
          {error && <p className="text-sm text-tibetan">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
