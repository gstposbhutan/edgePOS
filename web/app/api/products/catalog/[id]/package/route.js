import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/** GET /api/products/catalog/[id]/package — fetch packages for this entity */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx

    const { data, error } = await supabase
      .from('product_packages')
      .select(`
        id, name, package_type, barcode, qr_code, wholesale_price, mrp, hsn_code, is_active,
        product:product_id (id, name, image_url),
        package_items (
          id, quantity,
          product:product_id (id, name, sku, unit, current_stock)
        )
      `)
      .eq('created_by', entityId)
      .order('name')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ packages: data ?? [] })
  } catch (err) {
    console.error('[products/catalog/[id]/package] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/products/catalog/[id]/package — create a new package */
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { entityId, supabase } = ctx
    const body = await request.json()
    const { formData, componentItems, categoryIds } = body

    // 1. Create the package product listing
    const { data: product, error: prodError } = await supabase
      .from('products')
      .insert({
        name:            formData.name.trim(),
        hsn_code:        formData.hsn_code?.trim() || '9999',
        mrp:             parseFloat(formData.mrp) || 0,
        wholesale_price: parseFloat(formData.wholesale_price) || 0,
        image_url:       formData.image_url?.trim() || null,
        product_type:    'PACKAGE',
        is_active:       true,
        created_by:      entityId,
      })
      .select('id').single()

    if (prodError) return NextResponse.json({ error: prodError.message }, { status: 500 })

    // 2. Create the package definition
    const { data: pkg, error: pkgError } = await supabase
      .from('product_packages')
      .insert({
        product_id:      product.id,
        name:            formData.name.trim(),
        package_type:    formData.package_type || 'BUNDLE',
        barcode:         formData.barcode?.trim() || null,
        qr_code:         formData.qr_code?.trim() || null,
        wholesale_price: parseFloat(formData.wholesale_price) || 0,
        mrp:             parseFloat(formData.mrp) || 0,
        hsn_code:        formData.hsn_code?.trim() || null,
        is_active:       true,
        created_by:      entityId,
      })
      .select('id').single()

    if (pkgError) return NextResponse.json({ error: pkgError.message }, { status: 500 })

    // 3. Insert component items
    if (componentItems?.length > 0) {
      const { error: itemsError } = await supabase
        .from('package_items')
        .insert(componentItems.map(c => ({
          package_id: pkg.id,
          product_id: c.product_id,
          quantity:   c.quantity,
        })))
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // 4. Assign categories
    if (categoryIds?.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: product.id, category_id: cid }))
      )
    }

    // 5. Associate with entity
    await supabase.from('entity_packages').insert({
      entity_id: entityId, package_id: pkg.id, is_default: false,
    })

    return NextResponse.json({ packageId: pkg.id }, { status: 201 })
  } catch (err) {
    console.error('[products/catalog/[id]/package] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PATCH /api/products/catalog/[id]/package — update a package */
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = ctx.supabase
    const body = await request.json()
    const { packageId, productId, formData, componentItems, categoryIds } = body

    // Update product listing
    await supabase.from('products').update({
      name:            formData.name.trim(),
      hsn_code:        formData.hsn_code?.trim() || '9999',
      mrp:             parseFloat(formData.mrp) || 0,
      wholesale_price: parseFloat(formData.wholesale_price) || 0,
      image_url:       formData.image_url?.trim() || null,
    }).eq('id', productId)

    // Update package definition
    const { error } = await supabase.from('product_packages').update({
      name:            formData.name.trim(),
      package_type:    formData.package_type,
      barcode:         formData.barcode?.trim() || null,
      qr_code:         formData.qr_code?.trim() || null,
      wholesale_price: parseFloat(formData.wholesale_price) || 0,
      mrp:             parseFloat(formData.mrp) || 0,
      hsn_code:        formData.hsn_code?.trim() || null,
    }).eq('id', packageId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Replace component items
    await supabase.from('package_items').delete().eq('package_id', packageId)
    if (componentItems?.length > 0) {
      await supabase.from('package_items').insert(
        componentItems.map(c => ({ package_id: packageId, product_id: c.product_id, quantity: c.quantity }))
      )
    }

    // Replace categories
    await supabase.from('product_categories').delete().eq('product_id', productId)
    if (categoryIds?.length > 0) {
      await supabase.from('product_categories').insert(
        categoryIds.map(cid => ({ product_id: productId, category_id: cid }))
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[products/catalog/[id]/package] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/products/catalog/[id]/package — deactivate a package */
export async function DELETE(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = ctx.supabase
    const { packageId, productId } = await request.json()

    await Promise.all([
      supabase.from('product_packages').update({ is_active: false }).eq('id', packageId),
      supabase.from('products').update({ is_active: false }).eq('id', productId),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[products/catalog/[id]/package] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
