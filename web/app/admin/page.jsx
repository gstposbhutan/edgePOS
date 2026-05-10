'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/hooks/use-admin-auth'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Package, ShoppingCart, Banknote } from 'lucide-react'

export default function AdminDashboard() {
  const { entityId, loading: authLoading } = useAdminAuth()
  const [stats, setStats] = useState({ team: 0, products: 0, orders: 0, revenue: 0 })
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    if (!entityId) return

    async function loadStats() {
      const supabase = createClient()

      const [teamRes, productsRes, ordersRes] = await Promise.all([
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('entity_id', entityId),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('created_by', entityId).eq('is_active', true),
        supabase.from('orders').select('id, grand_total').eq('seller_id', entityId).eq('status', 'COMPLETED'),
      ])

      const revenue = (ordersRes.data || []).reduce((sum, o) => sum + (parseFloat(o.grand_total) || 0), 0)

      setStats({
        team: teamRes.count || 0,
        products: productsRes.count || 0,
        orders: ordersRes.data?.length || 0,
        revenue,
      })
      setStatsLoading(false)
    }

    loadStats()
  }, [entityId])

  if (authLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const cards = [
    { label: 'Team Members', value: stats.team, icon: Users, format: v => v },
    { label: 'Active Products', value: stats.products, icon: Package, format: v => v },
    { label: 'Completed Orders', value: stats.orders, icon: ShoppingCart, format: v => v },
    { label: 'Total Revenue', value: stats.revenue, icon: Banknote, format: v => `Nu. ${v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, format }) => (
          <Card key={label} className="glassmorphism">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{format(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
