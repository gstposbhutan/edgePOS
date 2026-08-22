import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { convertSalesOrderToInvoice } from '@/lib/console/b2b-order'

// Convert a Sales Order (or Quotation) into a Sales Invoice — the seller fulfils it. Creates a
// confirmed SALES_INVOICE that deducts the seller's stock and debits the buyer's khata (credit),
// receives the goods into the buyer, and marks the SO fulfilled. Full conversion (v1).
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

/** POST /api/console/sales/[id]/invoice — fulfil a sales order into an invoice. */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const { entityId, userId, supabase } = ctx

    const result = await convertSalesOrderToInvoice({ supabase, sellerId: entityId, soId: id, userId })
    if (!result.ok) return NextResponse.json({ error: result.error, invoice: result.invoice }, { status: result.status })
    return NextResponse.json(
      result.warning ? { invoice: result.invoice, warning: result.warning } : { invoice: result.invoice },
      { status: 201 },
    )
  } catch (err) {
    console.error('[console/sales/[id]/invoice] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
