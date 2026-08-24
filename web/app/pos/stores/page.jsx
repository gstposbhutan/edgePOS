'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { OfficeShell } from '@/components/pos/office/office-shell'
import { OfficeGrid } from '@/components/pos/office/office-grid'
import { MASTER_KEYS, withHandlers } from '@/lib/pos/office-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Store, Plus, X, Loader2, ArrowLeft } from 'lucide-react'

function AddStoreModal({ open, onClose, onAdded }) {
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
        headers: { 'Content-Type': 'application/json' },
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
  const [subRole,   setSubRole]   = useState(null)
  const [role,      setRole]      = useState(null)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }

      const { role: r, subRole: sr } = getRoleClaims(user)
      // Allow OWNER retailers and admin roles
      if (r === 'RETAILER' && sr !== 'OWNER') { router.push('/pos'); return }
      setSubRole(sr)
      setRole(r)

      const res = await fetch('/api/admin/stores')
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
    <OfficeShell
      crumb="Master Data Management"
      title="Store Register"
      keys={[
        ...(role === 'SUPER_ADMIN' ? [{ key: 'N', label: 'Add Store', onClick: () => setModalOpen(true) }] : []),
        ...withHandlers(MASTER_KEYS, {}).filter(k => k.key === 'Esc'),
      ]}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[12px]">
        <span className="opacity-75">{stores.length} store{stores.length !== 1 ? 's' : ''}</span>
      </div>

      <OfficeGrid
        columns={[
          { key: 'name',    label: 'Store' },
          { key: 'tpn',     label: 'TPN / GSTIN', width: 160 },
          { key: 'phone',   label: 'Phone',       width: 150 },
          { key: 'primary', label: 'Primary',     width: 90 },
          { key: 'status',  label: 'Status',      width: 100 },
          { key: '_act', label: '', width: 110, render: (_v, row) => (
            <span onClick={e => e.stopPropagation()}>
              <button type="button" className="underline" onClick={() => router.push('/pos')}>Open</button>
            </span>
          ) },
        ]}
        rows={stores.map(st => ({
          id: st.id,
          name: st.name,
          tpn: st.tpn_gstin || '—',
          phone: st.whatsapp_no || '—',
          primary: st.is_primary ? 'Primary' : '',
          status: st.is_active ? 'Active' : 'Inactive',
        }))}
        empty="No stores yet."
      />

      <AddStoreModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={store => setStores(prev => [...prev, { ...store, is_primary: prev.length === 0 }])}
      />
    </OfficeShell>
  )
}
