'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Loader2 } from 'lucide-react'
import { ConsoleShell } from '@/components/console/console-shell'
import { distributorNav } from '@/components/console/nav-config'
import { TeamManager } from '@/components/team/team-manager'

export default function DistributorTeamPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const u = await getUser()
      if (!u) { router.push('/login'); return }
      const { role } = getRoleClaims(u)
      if (role !== 'DISTRIBUTOR') { router.push('/'); return }
      setUser(u); setReady(true)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || ''

  return (
    <ConsoleShell title="Distributor Console" name={name} nav={distributorNav()} active="team">
      <TeamManager title="Team" />
    </ConsoleShell>
  )
}
