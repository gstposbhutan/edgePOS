import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { packCaseFields } from '@/lib/units'

/**
 * GET /api/products/catalog/[id] — one product's whole record.
 *
 * The catalogue list endpoints return what a LIST needs. The product card shows the record on one
 * sheet, so it needs the fields a list has no room for — the pack/case ladder, rotation, the
 * exemption flag, specifications. Scoped by `created_by`, which is how the list endpoint scopes:
 * products is a SHARED catalogue with no entity_id of its own, so a shop's own rows are the ones
 * it created. A product id belonging to another shop reads as missing, not as their data.
 */
export async function GET(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { entityId, supabase } = ctx

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('created_by', entityId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ product: data })
  } catch (err) {
    console.error('[products/catalog/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH /api/products/catalog/[id] — update a product */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = ctx.supabase
    const { formData, categoryIds } = await request.json()

    const packCase = packCaseFields(formData)
    if (packCase.error) return NextResponse.json({ error: packCase.error }, { status: 400 })

    const { error } = await supabase
      .from('products')
      .update({
        name:            formData.name.trim(),
        sku:             formData.sku?.trim() || null,
        hsn_code:        formData.hsn_code.trim(),
        brand:           formData.brand?.trim() || null,
        ...(formData.stock_rotation ? { stock_rotation: ['FEFO','FIFO','NONE'].includes(formData.stock_rotation) ? formData.stock_rotation : 'FIFO' } : {}),
        unit:            formData.unit || 'pcs',
        image_url:       formData.image_url?.trim() || null,
        reorder_point:   parseInt(formData.reorder_point) || 10,
        sold_by_weight:  !!formData.sold_by_weight,
        gst_exempt:      !!formData.gst_exempt,
        ...packCase.fields,
        video_url:       formData.video_url?.trim() || null,
        ...(formData.specifications !== undefined ? { specifications: formData.specifications || {} } : {}),
      })
      .eq('id', id)

    if (error) {
      if (error.code === '23514') return NextResponse.json({ error: error.message }, { status: 409 })  // FEFO/rotation guard
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Category TAGS retired (Phase 2) — no longer written/replaced on edit. Existing tag rows are
    // left untouched during the bake-in (tables dropped in Phase 3).

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[products/catalog/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
