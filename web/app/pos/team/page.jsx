'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Loader2 } from 'lucide-react'
import { TeamManager } from '@/components/team/team-manager'
import { OfficeShell } from '@/components/pos/office/office-shell'
import { MASTER_KEYS, withHandlers } from '@/lib/pos/office-keys'

export default function TeamPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) { router.push('/login'); return }

      const { role, subRole } = getRoleClaims(user)
      // Non-owner retailers don't manage staff — bounce them back to the POS.
      if (role === 'RETAILER' && subRole !== 'OWNER') { router.push('/pos'); return }
      setReady(true)
    }
    init()
  }, [router])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // TeamManager keeps its own controls for now — the frame is what a shopkeeper navigates by, and
  // it can be right before the widgets inside it are.
  return (
    <OfficeShell
      crumb="Master Data Management"
      title="Team Members"
      keys={withHandlers(MASTER_KEYS, {}).filter(k => k.key === 'Esc')}
    >
      <div className="max-w-4xl">
        <TeamManager />
      </div>
    </OfficeShell>
  )
}
