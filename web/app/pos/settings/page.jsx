'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUser } from '@/lib/auth'
import { EntityProfileForm } from '@/components/console/entity-profile-form'

/**
 * Retailer/vendor self-serve settings: business profile + marketplace storefront + fulfilment mode
 * (delivery vs pickup-only). Backed by the role-agnostic /api/admin/settings endpoint, scoped to the
 * caller's own entity. Reached from the POS console.
 */
export default function PosSettingsPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      const u = await getUser()
      if (!u) { router.push('/login'); return }
      setReady(true)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/pos')} title="Back to POS">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">Store Settings</h1>
      </div>
      <div className="p-4">
        <EntityProfileForm />
      </div>
    </div>
  )
}
