'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getUser } from '@/lib/auth'
import { EntityProfileForm } from '@/components/console/entity-profile-form'
import { OfficeShell } from '@/components/pos/office/office-shell'
import { MASTER_KEYS, withHandlers } from '@/lib/pos/office-keys'

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
    <OfficeShell
      crumb="Settings"
      title="Store Settings"
      keys={withHandlers(MASTER_KEYS, {}).filter(k => k.key === 'Esc')}
    >
      <EntityProfileForm />
    </OfficeShell>
  )
}
