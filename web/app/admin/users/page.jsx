'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { UserCog, Plus, X, Loader2, Bell, BellOff } from 'lucide-react'

const SUB_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'STAFF']

export default function AdminUsersPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [users, setUsers] = useState([])
  const [entities, setEntities] = useState([])
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }
      const { role } = getRoleClaims(user)
      if (role !== 'SUPER_ADMIN') { router.push('/admin'); return }
      await load()
      setReady(true)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const res = await fetch('/api/admin/users')
    if (res.ok) { const j = await res.json(); setUsers(j.users || []); setEntities(j.entities || []) }
  }

  async function toggleSuspend(u) {
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suspended: !u.banned }),
    })
    load()
  }

  async function toggleEmail(u) {
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, email_notifications_enabled: !u.email_notifications_enabled } : x))
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_notifications_enabled: !u.email_notifications_enabled }),
    })
  }

  if (!ready) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><UserCog className="h-6 w-6" /> Users</h1>
          <p className="text-sm text-muted-foreground">{users.length} across the platform</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Onboard User</Button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users yet.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{u.full_name || u.email} <span className="text-[11px] text-muted-foreground">· {u.email}</span></p>
                <p className="text-[11px] text-muted-foreground">{u.entity_name || '—'} · {u.role}{u.sub_role ? ` / ${u.sub_role}` : ''}</p>
              </div>
              {u.banned && <Badge variant="outline" className="text-xs text-muted-foreground">Suspended</Badge>}
              <Badge variant="outline" className="text-xs">{u.sub_role || u.role}</Badge>
              <button
                onClick={() => toggleEmail(u)}
                className={`transition-colors ${u.email_notifications_enabled ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
                title={u.email_notifications_enabled ? 'Email notifications ON — click to disable' : 'Email notifications OFF — click to enable'}
              >
                {u.email_notifications_enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
              <Button size="sm" variant="outline" onClick={() => toggleSuspend(u)}>{u.banned ? 'Reactivate' : 'Suspend'}</Button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && <OnboardModal entities={entities} onClose={() => setModalOpen(false)} onAdded={() => { load(); setModalOpen(false) }} />}
    </div>
  )
}

function OnboardModal({ entities, onClose, onAdded }) {
  const [form, setForm] = useState({ entity_id: '', email: '', password: '', full_name: '', sub_role: 'OWNER' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }))

  async function submit(ev) {
    ev.preventDefault(); setLoading(true); setError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json(); setLoading(false)
    if (!res.ok) { setError(data.error); return }
    onAdded(data.user)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-xl p-6 w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Onboard User</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <select value={form.entity_id} onChange={set('entity_id')} required className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">— Select entity —</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
          </select>
          <Input value={form.full_name} onChange={set('full_name')} placeholder="Full name *" required />
          <Input type="email" value={form.email} onChange={set('email')} placeholder="Email *" required />
          <Input type="password" value={form.password} onChange={set('password')} placeholder="Temp password (min 6) *" required minLength={6} />
          <select value={form.sub_role} onChange={set('sub_role')} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
            {SUB_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
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
