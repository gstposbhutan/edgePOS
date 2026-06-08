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

      // /admin is SUPER_ADMIN only — every other role goes to its own console (no shared routes).
      if (role !== 'SUPER_ADMIN') {
        const home = { DISTRIBUTOR: '/distributor', WHOLESALER: '/wholesaler', RIDER: '/rider', CUSTOMER: '/shop', RETAILER: '/pos' }
        router.push(home[role] || '/pos')
        return
      }

      setState({ user, entityId, role, subRole, loading: false })
    }

    check()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
