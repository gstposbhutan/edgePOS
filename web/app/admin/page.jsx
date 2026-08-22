'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'

const money = (v) => 'Nu ' + Math.round(Number(v) || 0).toLocaleString('en-IN')

export default function AdminDashboard() {
  const { loading: authLoading } = useAdminAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/stats')
        if (res.ok) setStats(await res.json())
      } catch {}
      setLoading(false)
    })()
  }, [])

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const s = stats?.pos || {}
  const cards = [
    { label: 'Entities', value: s.entities ?? 0, sub: `${s.retailers ?? 0} shops · ${s.wholesalers ?? 0} wholesale · ${s.distributors ?? 0} dist · ${s.customers ?? 0} customers` },
    { label: 'Users', value: s.users ?? 0 },
    { label: 'Active products', value: s.products ?? 0 },
    { label: 'Revenue (completed)', value: money(s.revenue), sub: `${s.orders ?? 0} orders` },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-bold text-foreground">Platform overview</h1>
        <Link href="/admin/entities" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Manage entities <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, sub }) => (
          <Card key={label} className="glassmorphism">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
