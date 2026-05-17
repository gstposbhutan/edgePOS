import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, userId, supabase } = ctx
    const vendorEntityId = entityId

    const { id: invoiceId } = await params

    // Fetch the invoice
    const { data: invoice } = await supabase
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
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'CONFIRMED' })
      .eq('id', invoiceId)

    if (updateErr) throw updateErr

    // Handle CREDIT payment — create/update supplier khata account
    if (invoice.payment_method === 'CREDIT' && invoice.seller_id) {
      const { data: existingKhata } = await supabase
        .from('khata_accounts')
        .select('id, outstanding_balance')
        .eq('creditor_entity_id', invoice.seller_id)
        .eq('debtor_entity_id', vendorEntityId)
        .eq('party_type', 'SUPPLIER')
        .single()

      let khataId = existingKhata?.id

      if (!khataId) {
        // Auto-create supplier khata account
        const { data: newKhata, error: khataErr } = await supabase
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
        await supabase
          .from('khata_accounts')
          .update({
            outstanding_balance: (parseFloat(existingKhata?.outstanding_balance || 0) + parseFloat(invoice.grand_total)).toFixed(2),
            updated_at: new Date().toISOString(),
          })
          .eq('id', khataId)

        const { error: txErr } = await supabase
          .from('khata_transactions')
          .insert({
            khata_account_id:  khataId,
            order_id:          invoiceId,
            transaction_type:  'DEBIT',
            amount:            invoice.grand_total,
            balance_after:     (parseFloat(existingKhata?.outstanding_balance || 0) + parseFloat(invoice.grand_total)).toFixed(2),
            notes:             'Purchase Invoice: ' + invoice.order_no,
            created_by:        userId,
          })
        if (txErr) console.error('[purchases/confirm] Khata tx error:', txErr.message)
      }
    }

    // Fetch the created batches to return in response
    const { data: batches } = await supabase
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
