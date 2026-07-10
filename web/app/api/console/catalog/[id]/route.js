import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * PATCH /api/console/catalog/[id] — update one of THIS vendor's products.
 * The update is scoped `.eq('id', id).eq('created_by', entityId)` so a vendor can only ever
 * touch products they own; another vendor's row simply matches nothing. Prices (wholesale /
 * mrp / distributor) are editable here — unlike the retailer flow, where prices come from
 * stock receipts. Stock is not adjusted on edit (mirrors the retailer form).
 */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['OWNER', 'MANAGER'].includes(ctx.subRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const { entityId, supabase } = ctx
    const { formData, categoryIds } = await request.json()

    if (!formData?.name?.trim()) return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    if (!formData?.hsn_code?.trim()) return NextResponse.json({ error: 'HSN code is required' }, { status: 400 })

    const { data: updated, error } = await supabase
      .from('products')
      .update({
        name:              formData.name.trim(),
        sku:               formData.sku?.trim() || null,
        hsn_code:          formData.hsn_code.trim(),
        unit:              formData.unit || 'pcs',
        wholesale_price:   numOrNull(formData.wholesale_price),
        mrp:               numOrNull(formData.mrp),
        distributor_price: numOrNull(formData.distributor_price),
        manufacturer_price: numOrNull(formData.manufacturer_price),
        gst_exempt:        !!formData.gst_exempt,
        reorder_point:     parseInt(formData.reorder_point) || 10,
        sold_by_weight:    !!formData.sold_by_weight,
      })
      .eq('id', id)
      .eq('created_by', entityId)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Replace category assignments
    await supabase.from('product_categories').delete().eq('product_id', id)
    if (categoryIds?.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: id, category_id: cid }))
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[console/catalog/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
