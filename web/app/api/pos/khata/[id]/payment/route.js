import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** POST /api/pos/khata/[id]/payment — record a repayment */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { userId, supabase } = ctx
    const { amount, payment_method, reference_no, notes } = await request.json()

    // Create repayment in CREATED status
    const { data: repayment, error } = await supabase
      .from('khata_repayments')
      .insert({
        khata_account_id: id,
        amount,
        payment_method,
        status: 'CREATED',
        reference_no: reference_no ?? null,
        notes: notes ?? null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Immediately confirm — trigger fires and reduces balance
    const { error: confirmError } = await supabase
      .from('khata_repayments')
      .update({
        status: 'PAYMENT_MADE',
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', repayment.id)

    if (confirmError) return NextResponse.json({ error: confirmError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[khata/[id]/payment] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
