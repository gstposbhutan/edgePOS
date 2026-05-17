"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function RiderLayout({ children }) {
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/rider/login') return
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/session')
        if (!res.ok) { router.push('/rider/login'); return }
        const { user } = await res.json()
        if (!user) router.push('/rider/login')
      } catch {
        router.push('/rider/login')
      }
    }
    checkAuth()
  }, [pathname, router])

  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
