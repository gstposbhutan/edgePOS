import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Confirm a Purchase Invoice (vendor consoles): moves it to CONFIRMED, which fires
// restock_on_invoice_confirm to create batches + RESTOCK the invoice's warehouse. On CREDIT, records
// the debt on the supplier khata (creditor = supplier, debtor = me, party_type SUPPLIER).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id: invoiceId } = await params
    const { entityId, userId, supabase } = ctx

    const { data: invoice } = await supabase
      .from('orders').select('id, order_no, status, buyer_id, seller_id, grand_total, payment_method')
      .eq('id', invoiceId).eq('order_type', 'PURCHASE_INVOICE').maybeSingle()
    if (!invoice) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
    if (invoice.buyer_id !== entityId) return NextResponse.json({ error: 'Not your invoice' }, { status: 403 })
    if (invoice.status !== 'DRAFT') return NextResponse.json({ error: `Invoice is already ${invoice.status}` }, { status: 409 })

    // Confirm → restock_on_invoice_confirm stocks the warehouse.
    const { error: updErr } = await supabase.from('orders').update({ status: 'CONFIRMED' }).eq('id', invoiceId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // CREDIT → supplier khata debit.
    if (invoice.payment_method === 'CREDIT' && invoice.seller_id) {
      const { data: khata } = await supabase
        .from('khata_accounts').select('id, outstanding_balance')
        .eq('creditor_entity_id', invoice.seller_id).eq('debtor_entity_id', entityId).eq('party_type', 'SUPPLIER').maybeSingle()
      let khataId = khata?.id
      const prevBal = parseFloat(khata?.outstanding_balance || 0)
      if (!khataId) {
        const { data: created, error: kErr } = await supabase.from('khata_accounts')
          .insert({ creditor_entity_id: invoice.seller_id, debtor_entity_id: entityId, party_type: 'SUPPLIER', credit_limit: 1000000, outstanding_balance: 0, created_by: userId })
          .select('id').single()
        if (kErr) console.error('[console/purchases/confirm] khata create:', kErr.message)
        else khataId = created.id
      }
      if (khataId) {
        const newBal = (prevBal + parseFloat(invoice.grand_total)).toFixed(2)
        await supabase.from('khata_accounts').update({ outstanding_balance: newBal, updated_at: new Date().toISOString() }).eq('id', khataId)
        const { error: txErr } = await supabase.from('khata_transactions').insert({
          khata_account_id: khataId, order_id: invoiceId, transaction_type: 'DEBIT', amount: invoice.grand_total,
          balance_after: newBal, notes: 'Purchase Invoice: ' + invoice.order_no, created_by: userId,
        })
        if (txErr) console.error('[console/purchases/confirm] khata tx:', txErr.message)
      }
    }

    return NextResponse.json({ success: true, invoice_no: invoice.order_no })
  } catch (err) {
    console.error('[console/purchases/[id]/confirm] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
