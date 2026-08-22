'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Loader2 } from 'lucide-react'
import { ConsoleShell } from '@/components/console/console-shell'
import { wholesalerNav } from '@/components/console/nav-config'
import { SalesOrders } from '@/components/console/sales-orders'

export default function WholesalerQuotesPage() {
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

  return (
    <ConsoleShell title="Wholesaler Console" name={name} nav={wholesalerNav()} active="quotes">
      <SalesOrders />
    </ConsoleShell>
  )
}
