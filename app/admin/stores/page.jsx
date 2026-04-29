'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Store, Plus, X, Loader2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function AddStoreModal({ open, onClose, onAdded, token }) {
  const [name,    setName]    = useState('')
  const [tpn,     setTpn]     = useState('')
  const [phone,   setPhone]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => { if (!open) { setName(''); setTpn(''); setPhone(''); setError(null) } }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, tpn_gstin: tpn, whatsapp_no: phone }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onAdded(data.store)
      onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add New Store</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Store Name <span className="text-tibetan">*</span></label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="My New Store" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">TPN / GSTIN</label>
            <Input value={tpn} onChange={e => setTpn(e.target.value)} placeholder="TPN0000001" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">WhatsApp Number</label>
            <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+975 17 123 456" />
          </div>
          {error && <p className="text-sm text-tibetan">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : 'Create Store'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminStoresPage() {
  const router = useRouter()
  const [stores,    setStores]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [token,     setToken]     = useState('')
  const [subRole,   setSubRole]   = useState(null)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }

      const { role, subRole: sr } = getRoleClaims(user)
      // Allow OWNER retailers and admin roles
      if (role === 'RETAILER' && sr !== 'OWNER') { router.push('/pos'); return }
      setSubRole(sr)

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setToken(session.access_token)

      const res = await fetch('/api/admin/stores', {
        headers: { authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.stores) setStores(data.stores)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header — no admin sidebar needed for OWNER */}
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/pos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2"><Store className="h-5 w-5" /> My Stores</h1>
          <p className="text-sm text-muted-foreground">{stores.length} store{stores.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="ml-auto gap-2">
          <Plus className="h-4 w-4" /> Add Store
        </Button>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {stores.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Store className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No stores yet. Create your first store.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {stores.map(store => (
              <div key={store.id} className="border border-border rounded-xl p-4 space-y-2 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{store.name}</p>
                  <Badge variant="outline" className={store.is_active
                    ? 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10 text-xs'
                    : 'text-xs text-muted-foreground'
                  }>
                    {store.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                {store.tpn_gstin && <p className="text-xs text-muted-foreground">TPN: {store.tpn_gstin}</p>}
                {store.whatsapp_no && <p className="text-xs text-muted-foreground">{store.whatsapp_no}</p>}
                {store.is_primary && (
                  <span className="inline-block text-[10px] font-medium text-primary border border-primary/30 bg-primary/5 px-1.5 py-0.5 rounded-full">
                    Primary store
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-1"
                  onClick={() => router.push('/pos')}
                >
                  Open POS
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>

      <AddStoreModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={store => setStores(prev => [...prev, { ...store, is_primary: prev.length === 0 }])}
        token={token}
      />
    </div>
  )
}
