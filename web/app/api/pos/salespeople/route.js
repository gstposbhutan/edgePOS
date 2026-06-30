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

  // Enrich with login email so the logout handover prompt can switch the active
  // cashier by name (the switch endpoint needs an email to authenticate against).
  let emailMap = {}
  try {
    const { data: list } = await ctx.supabase.auth.admin.listUsers()
    emailMap = Object.fromEntries((list?.users ?? []).map(u => [u.id, u.email]))
  } catch {
    // best-effort — fall back to no emails (handover modal can prompt for one)
  }

  const salespeople = (data ?? []).map(p => ({ ...p, email: emailMap[p.id] || '' }))
  return NextResponse.json({ salespeople })
}
