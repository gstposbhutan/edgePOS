import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: invoiceId } = await params
    const serviceClient = createServiceClient()

    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('entity_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.entity_id) return NextResponse.json({ error: 'Vendor entity not found' }, { status: 403 })
    const vendorEntityId = profile.entity_id

    // Fetch the invoice
    const { data: invoice } = await serviceClient
      .from('orders')
      .select('id, order_no, status, order_type, buyer_id, seller_id, grand_total, payment_method')
      .eq('id', invoiceId)
      .eq('order_type', 'PURCHASE_INVOICE')
      .single()

    if (!invoice) return NextResponse.json({ error: 'Purchase Invoice not found' }, { status: 404 })
    if (invoice.buyer_id !== vendorEntityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (invoice.status !== 'DRAFT') {
      return NextResponse.json({ error: `Invoice is already ${invoice.status}` }, { status: 400 })
    }

    // Confirm the invoice — DB trigger restock_on_invoice_confirm fires here
    const { error: updateErr } = await serviceClient
      .from('orders')
      .update({ status: 'CONFIRMED' })
      .eq('id', invoiceId)

    if (updateErr) throw updateErr

    // Handle CREDIT payment — create/update supplier khata account
    if (invoice.payment_method === 'CREDIT' && invoice.seller_id) {
      const { data: existingKhata } = await serviceClient
        .from('khata_accounts')
        .select('id, outstanding_balance')
        .eq('creditor_entity_id', invoice.seller_id)
        .eq('debtor_entity_id', vendorEntityId)
        .eq('party_type', 'SUPPLIER')
        .single()

      let khataId = existingKhata?.id

      if (!khataId) {
        // Auto-create supplier khata account
        const { data: newKhata, error: khataErr } = await serviceClient
          .from('khata_accounts')
          .insert({
            creditor_entity_id: invoice.seller_id,   // supplier is the creditor (owed money)
            debtor_entity_id:   vendorEntityId,       // vendor owes the supplier
            party_type:         'SUPPLIER',
            debtor_name:        null,                 // resolved from entity
            credit_limit:       1000000,              // Nu. 10 lakh default
            outstanding_balance: 0,
          })
          .select('id')
          .single()

        if (khataErr) console.error('[purchases/confirm] Khata create error:', khataErr.message)
        else khataId = newKhata.id
      }

      if (khataId) {
        // Debit — vendor owes supplier this amount
        await serviceClient
          .from('khata_accounts')
          .update({
            outstanding_balance: (parseFloat(existingKhata?.outstanding_balance || 0) + parseFloat(invoice.grand_total)).toFixed(2),
            updated_at: new Date().toISOString(),
          })
          .eq('id', khataId)

        const { error: txErr } = await serviceClient
          .from('khata_transactions')
          .insert({
            khata_account_id:  khataId,
            order_id:          invoiceId,
            transaction_type:  'DEBIT',
            amount:            invoice.grand_total,
            balance_after:     (parseFloat(existingKhata?.outstanding_balance || 0) + parseFloat(invoice.grand_total)).toFixed(2),
            notes:             'Purchase Invoice: ' + invoice.order_no,
            created_by:        session.user.id,
          })
        if (txErr) console.error('[purchases/confirm] Khata tx error:', txErr.message)
      }
    }

    // Fetch the created batches to return in response
    const { data: batches } = await serviceClient
      .from('product_batches')
      .select('id, batch_number, product_id, quantity, products(name)')
      .eq('entity_id', vendorEntityId)
      .like('notes', `%${invoice.order_no}%`)

    return NextResponse.json({
      success: true,
      invoice_no: invoice.order_no,
      batches_created: batches?.length ?? 0,
      batches: batches || [],
    })

  } catch (error) {
    console.error('[purchases/[id]/confirm]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
