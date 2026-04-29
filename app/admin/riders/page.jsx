'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Bike, ToggleLeft, ToggleRight, X, Loader2 } from 'lucide-react'

function AddRiderModal({ open, onClose, onAdded, token }) {
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [pin,     setPin]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!open) { setName(''); setPhone(''); setPin(''); setError(null) }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/riders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, whatsapp_no: phone, pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onAdded(data.rider)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add Rider</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Rider name" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">WhatsApp Number</label>
            <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+975 17 123 456" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Initial PIN (4–6 digits)</label>
            <Input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} maxLength={6} placeholder="Set a PIN" required />
            <p className="text-xs text-muted-foreground">Rider can change this from their profile.</p>
          </div>
          {error && <p className="text-sm text-tibetan">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</> : 'Add Rider'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminRidersPage() {
  const { user, loading: authLoading } = useAdminAuth()
  const [riders,    setRiders]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [token,     setToken]     = useState('')

  async function loadRiders() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setToken(session.access_token)
    const res = await fetch('/api/admin/riders', {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (data.riders) setRiders(data.riders)
    setLoading(false)
  }

  useEffect(() => { if (user) loadRiders() }, [user])

  async function toggleActive(rider) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/admin/riders/${rider.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ is_active: !rider.is_active }),
    })
    setRiders(prev => prev.map(r => r.id === rider.id ? { ...r, is_active: !r.is_active } : r))
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Bike className="h-5 w-5" /> Riders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{riders.length} rider{riders.length !== 1 ? 's' : ''} registered</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Add Rider
        </Button>
      </div>

      {riders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bike className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No riders yet. Add the first one.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">WhatsApp</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Availability</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {riders.map(rider => (
                <tr key={rider.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{rider.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{rider.whatsapp_no}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={rider.is_active
                      ? 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-muted-foreground'
                    }>
                      {rider.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={rider.is_available && rider.is_active
                      ? 'text-blue-600 border-blue-500/30 bg-blue-500/10'
                      : 'text-muted-foreground'
                    }>
                      {rider.current_order_id ? 'On delivery' : rider.is_available ? 'Available' : 'Unavailable'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(rider)}
                      className={`transition-colors ${rider.is_active ? 'text-emerald-600 hover:text-tibetan' : 'text-muted-foreground hover:text-emerald-600'}`}
                      title={rider.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {rider.is_active
                        ? <ToggleRight className="h-5 w-5" />
                        : <ToggleLeft className="h-5 w-5" />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddRiderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={rider => setRiders(prev => [rider, ...prev])}
        token={token}
      />
    </div>
  )
}
