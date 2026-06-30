'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Loader2 } from 'lucide-react'
import { ConsoleShell } from '@/components/console/console-shell'
import { wholesalerNav } from '@/components/console/nav-config'

// Wholesaler console landing. Catalog, Team, Settings, retailer browse/favourites and
// warehouses are live; any remaining tiles surface as "coming soon". Web-only (no offline desktop).
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
  const tiles = wholesalerNav()

  return (
    <ConsoleShell title="Wholesaler Console" name={name} nav={tiles} active={null}>
      <div className="rounded-lg border border-dashed border-border p-4 mb-6 text-sm text-muted-foreground">
        Manage your catalog, warehouses, team and business profile, and browse retailers to save your favourites.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map(({ key, label, href, icon: Icon, enabled, note }) =>
          enabled ? (
            <Link key={key} href={href} className="group border border-border rounded-xl p-4 space-y-1 transition-colors hover:border-primary/40 hover:bg-muted/30">
              <Icon className="h-5 w-5 text-primary" />
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{note}</p>
            </Link>
          ) : (
            <div key={key} className="border border-border rounded-xl p-4 space-y-1 opacity-70">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{note}</p>
              <span className="inline-block text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 mt-1">Coming soon</span>
            </div>
          )
        )}
      </div>
    </ConsoleShell>
  )
}
