"use client"

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RiderLayout({ children }) {
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/rider/login') return
    async function checkAuth() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/rider/login')
    }
    checkAuth()
  }, [pathname, router])

  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
