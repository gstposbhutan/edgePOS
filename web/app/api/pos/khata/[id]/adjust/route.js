import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/khata/[id]/adjust — adjust account balance (OWNER only) */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { userId, supabase } = ctx
    const { type, amount, reason } = await request.json()

    // Fetch current balance
    const { data: account } = await supabase
      .from('khata_accounts')
      .select('outstanding_balance')
      .eq('id', id)
      .single()

    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const adjAmount = type === 'WRITE_OFF' ? -Math.abs(amount) : amount
    const newBalance = Math.max(0, parseFloat(account.outstanding_balance) + adjAmount)

    const { error: updateError } = await supabase
      .from('khata_accounts')
      .update({
        outstanding_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Log the adjustment
    const { error: txnError } = await supabase
      .from('khata_transactions')
      .insert({
        khata_account_id: id,
        transaction_type: 'ADJUSTMENT',
        amount: Math.abs(adjAmount),
        balance_after: newBalance,
        notes: `[${type}] ${reason}`,
        created_by: userId,
      })

    if (txnError) return NextResponse.json({ error: txnError.message }, { status: 500 })

    return NextResponse.json({ success: true, newBalance })
  } catch (err) {
    console.error('[khata/[id]/adjust] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
