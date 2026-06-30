import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// Opening a vendor package: convert N sealed parent units into their direct components
// (one level — pallet -> boxes, box -> pieces). The actual stock math runs inside the
// open_package RPC (which also guards ownership + on-hand), so this route just authenticates,
// gates to OWNER/MANAGER, and passes the caller's entity id through. The entity id comes from
// the server context — never from the client — so a vendor can only open their own packages.

/** POST /api/console/packages/open — open `qty` units of a package this vendor owns */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { entityId, supabase } = ctx
    const { package_product_id, qty } = await request.json()

    if (!package_product_id) {
      return NextResponse.json({ error: 'package_product_id is required' }, { status: 400 })
    }
    const openQty = parseInt(qty)
    if (!Number.isFinite(openQty) || openQty < 1) {
      return NextResponse.json({ error: 'qty must be at least 1' }, { status: 400 })
    }

    const { error } = await supabase.rpc('open_package', {
      p_package_product_id: package_product_id,
      p_entity_id:          entityId,
      p_qty:                openQty,
    })

    if (error) {
      // The RPC RAISEs for ownership / insufficient-stock — surface those as 400s.
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Return the touched products' fresh on-hand so the UI can refresh without a full reload:
    // the opened package plus each direct component.
    const { data: pkg } = await supabase
      .from('product_packages')
      .select('id, package_items(product_id)')
      .eq('product_id', package_product_id)
      .maybeSingle()

    const touchedIds = [package_product_id, ...(pkg?.package_items ?? []).map(pi => pi.product_id)]
    const { data: stocks } = await supabase
      .from('products')
      .select('id, name, current_stock')
      .in('id', touchedIds)

    return NextResponse.json({ success: true, stocks: stocks ?? [] })
  } catch (err) {
    console.error('[console/packages/open] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
