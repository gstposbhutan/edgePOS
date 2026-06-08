'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims, signOut } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Loader2, Building2, Store, Star, Package, Users, Warehouse, LogOut } from 'lucide-react'

// Wholesaler console landing. Full features (browse all retailers with a favourites
// overlay, warehouses, own catalog, own team) are deferred; this is the role's valid
// landing so signup/login completes. Web-only (no offline desktop for wholesalers).
export default function WholesalerHome() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const u = await getUser()
      if (!u) { router.push('/login'); return }
      const { role } = getRoleClaims(u)
      if (role !== 'WHOLESALER') { router.push('/'); return }
      setUser(u); setReady(true)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || ''
  const tiles = [
    { label: 'Retailers', icon: Store, note: 'Browse all · save favourites' },
    { label: 'Saved', icon: Star, note: 'Your favourites' },
    { label: 'Warehouses', icon: Warehouse, note: 'Your buildings/depots' },
    { label: 'Catalog', icon: Package, note: 'Your products' },
    { label: 'Team', icon: Users, note: 'Your staff' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center"><Building2 className="h-4 w-4 text-primary-foreground" /></div>
        <div className="flex-1">
          <h1 className="font-serif font-bold">Wholesaler Console</h1>
          <p className="text-xs text-muted-foreground">{name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => { await signOut(); router.push('/login') }} className="gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </header>
      <main className="p-6 max-w-4xl mx-auto">
        <div className="rounded-lg border border-dashed border-border p-4 mb-6 text-sm text-muted-foreground">
          Wholesaler features are being built — browse all retailers with a favourites overlay, manage your warehouses, catalog and team. This is your console landing.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map(({ label, icon: Icon, note }) => (
            <div key={label} className="border border-border rounded-xl p-4 space-y-1 opacity-70">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{note}</p>
              <span className="inline-block text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 mt-1">Coming soon</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
