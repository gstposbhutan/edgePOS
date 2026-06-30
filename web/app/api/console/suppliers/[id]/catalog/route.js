import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// A linked distributor's sellable catalog, for a wholesaler to browse before ordering. Mirrors
// /api/wholesale/catalog (the retailer→wholesaler version): verify the link first, then return the
// distributor's active products that carry a B2B price. The sellable rate here is distributor_price
// (what the distributor charges wholesalers); current_stock is the distributor's stock.

/** GET /api/console/suppliers/[id]/catalog — products this distributor sells to me. */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (ctx.role !== 'WHOLESALER') {
      return NextResponse.json({ error: 'Only wholesalers can browse distributor catalogs' }, { status: 403 })
    }

    const { id: distributorId } = await params
    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    if (!distributorId) {
      return NextResponse.json({ error: 'distributor id required' }, { status: 400 })
    }

    // Verify the link before exposing the catalog (403 if not linked).
    const { data: link } = await supabase
      .from('distributor_wholesalers')
      .select('distributor_id')
      .eq('distributor_id', distributorId)
      .eq('wholesaler_id', entityId)
      .eq('active', true)
      .limit(1)

    if (!link?.length) {
      return NextResponse.json({ error: 'Not linked to this distributor' }, { status: 403 })
    }

    let query = supabase
      .from('products')
      .select('id, name, sku, distributor_price, mrp, unit, current_stock, hsn_code')
      .eq('created_by', distributorId)
      .eq('is_active', true)
      .gt('distributor_price', 0)
      .order('name')

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const { data: products, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ products: products ?? [] })
  } catch (err) {
    console.error('[console/suppliers/catalog] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
