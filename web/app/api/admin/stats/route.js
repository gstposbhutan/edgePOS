import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase
  const entityId = ctx.entityId

  const [teamRes, productsRes, ordersRes] = await Promise.all([
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('entity_id', entityId),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('created_by', entityId).eq('is_active', true),
    supabase.from('orders').select('id, grand_total').eq('seller_id', entityId).eq('status', 'COMPLETED'),
  ])

  const revenue = (ordersRes.data || []).reduce((sum, o) => sum + (parseFloat(o.grand_total) || 0), 0)

  return NextResponse.json({
    team: teamRes.count || 0,
    products: productsRes.count || 0,
    orders: ordersRes.data?.length || 0,
    revenue,
  })
}
