import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/salespeople — the store's sales-attributable team for the F8
 * sales-person picker. Returns CASHIER / STAFF / MANAGER profiles for the
 * current entity. (Kept separate from /api/admin/team so POS roles can read it.)
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from('user_profiles')
    .select('id, full_name, sub_role')
    .eq('entity_id', ctx.entityId)
    .in('sub_role', ['CASHIER', 'STAFF', 'MANAGER'])
    .order('sub_role', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ salespeople: data ?? [] })
}
