'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft } from 'lucide-react'
import { TeamManager } from '@/components/team/team-manager'

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold">Team Members</h1>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <TeamManager />
      </main>
    </div>
  )
}
