"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { MarketingNav } from '@/components/marketing/marketing-nav'

// Browsing the marketplace is public (unauthenticated). Only the buyer actions — checkout and
// order history — require a login/signup; those subpaths are gated here, everything else is open.
const AUTH_REQUIRED_PREFIXES = ['/shop/checkout', '/shop/orders']

export default function ShopLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const needsAuth = AUTH_REQUIRED_PREFIXES.some(p => pathname.startsWith(p))
    if (!needsAuth) return
    async function checkAuth() {
      const user = await getUser()
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      }
    }
    checkAuth()
  }, [pathname, router])

  return (
    <>
      <MarketingNav />
      {children}
    </>
  )
}
