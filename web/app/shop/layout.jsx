"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getUser } from '@/lib/auth'

export default function ShopLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    async function checkAuth() {
      const user = await getUser()
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      }
    }
    checkAuth()
  }, [pathname, router])

  return children
}
