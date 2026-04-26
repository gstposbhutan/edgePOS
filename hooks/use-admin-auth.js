'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser, getRoleClaims } from '@/lib/auth'

/**
 * Auth guard hook for admin pages.
 * Returns { user, entityId, role, subRole, loading }.
 * Redirects to /login if no session, /pos if RETAILER.
 */
export function useAdminAuth() {
  const router = useRouter()
  const [state, setState] = useState({
    user: null,
    entityId: null,
    role: null,
    subRole: null,
    loading: true,
  })

  useEffect(() => {
    async function check() {
      const user = await getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { entityId, role, subRole } = getRoleClaims(user)

      if (role === 'RETAILER') {
        router.push('/pos')
        return
      }

      setState({ user, entityId, role, subRole, loading: false })
    }

    check()
  }, [router])

  return state
}
