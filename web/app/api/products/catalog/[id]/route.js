import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** PATCH /api/products/catalog/[id] — update a product */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = ctx.supabase
    const { formData, categoryIds } = await request.json()

    const { error } = await supabase
      .from('products')
      .update({
        name:            formData.name.trim(),
        sku:             formData.sku?.trim() || null,
        hsn_code:        formData.hsn_code.trim(),
        unit:            formData.unit || 'pcs',
        image_url:       formData.image_url?.trim() || null,
        reorder_point:   parseInt(formData.reorder_point) || 10,
        sold_by_weight:  !!formData.sold_by_weight,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Replace category assignments
    await supabase.from('product_categories').delete().eq('product_id', id)
    if (categoryIds?.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: id, category_id: cid }))
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[products/catalog/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
