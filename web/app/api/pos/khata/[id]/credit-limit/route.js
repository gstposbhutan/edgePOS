import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/khata/[id]/credit-limit — set credit limit (OWNER only) */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { userId, supabase } = ctx
    const { limit } = await request.json()

    const { error } = await supabase
      .from('khata_accounts')
      .update({
        credit_limit: limit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log limit change
    const { data: acct } = await supabase
      .from('khata_accounts')
      .select('outstanding_balance')
      .eq('id', id)
      .single()

    await supabase
      .from('khata_transactions')
      .insert({
        khata_account_id: id,
        transaction_type: 'ADJUSTMENT',
        amount: 0,
        balance_after: acct?.outstanding_balance ?? 0,
        notes: `Credit limit set to Nu. ${limit}`,
        created_by: userId,
      })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[khata/[id]/credit-limit] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
