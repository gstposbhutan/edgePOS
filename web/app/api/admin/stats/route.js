import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Platform-wide super-admin stats for the /admin dashboard. (The suite's hotel/travel
// sections are gone — this app is the whole platform now.)
const SUPER = 'SUPER_ADMIN'
const count = async (q) => (await q.select('id', { count: 'exact', head: true })).count || 0

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== SUPER) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const sb = ctx.supabase

  const [entities, users, productsRes, orders] = await Promise.all([
    sb.from('entities').select('role'),
    count(sb.from('user_profiles')),
    sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
    sb.from('orders').select('grand_total,status').eq('status', 'COMPLETED'),
  ])

  const ent = entities.data || []
  const byRole = (r) => ent.filter((e) => e.role === r).length
  const revenue = (orders.data || []).reduce((s, o) => s + (parseFloat(o.grand_total) || 0), 0)

  return NextResponse.json({
    pos: {
      entities: ent.length,
      retailers: byRole('RETAILER'),
      wholesalers: byRole('WHOLESALER'),
      distributors: byRole('DISTRIBUTOR'),
      customers: byRole('CUSTOMER'),
      users,
      products: productsRes.count || 0,
      orders: orders.data?.length || 0,
      revenue,
    },
  })
}
