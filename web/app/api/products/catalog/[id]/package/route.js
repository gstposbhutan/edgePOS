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
        stocked_as_unit, source_package_id,
        product:product_id (id, name, image_url, current_stock, product_type),
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

    // Model-B (vendor) packages opt in via stocked_as_unit: each level keeps its own sealed
    // on-hand in current_stock, and the picked opening_stock seeds it. Retailer packages omit
    // both flags, so they behave exactly as before (no opening stock, stocked_as_unit false).
    const stockedAsUnit = !!formData.stocked_as_unit
    const openingStock  = parseInt(formData.opening_stock) || 0

    // 1. Create the package product listing. We do NOT seed current_stock here even for
    // Model-B packages — the opening-stock RESTOCK movement below drives it via the
    // inventory_movement_apply trigger, so it lands at exactly the opening qty (no double count).
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
        product_id:        product.id,
        name:              formData.name.trim(),
        package_type:      formData.package_type || 'BUNDLE',
        barcode:           formData.barcode?.trim() || null,
        qr_code:           formData.qr_code?.trim() || null,
        wholesale_price:   parseFloat(formData.wholesale_price) || 0,
        mrp:               parseFloat(formData.mrp) || 0,
        hsn_code:          formData.hsn_code?.trim() || null,
        is_active:         true,
        stocked_as_unit:   stockedAsUnit,
        created_by:        entityId,
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

    // 6. Opening stock for this level — a batch + RESTOCK movement, the same flow the vendor
    // catalog uses for SINGLE products. The movement gives the package product its real
    // current_stock (Model B). Only vendor packages send opening_stock.
    if (openingStock > 0) {
      const batchNo = formData.batch_number?.trim() || `OPEN-${Date.now()}`
      const { data: batch } = await supabase
        .from('product_batches')
        .insert({
          product_id:      product.id,
          entity_id:       entityId,
          batch_number:    batchNo,
          manufactured_at: formData.manufactured_at || null,
          expires_at:      formData.expires_at || null,
          quantity:        openingStock,
          status:          'ACTIVE',
          notes:           'Opening stock',
        })
        .select('id')
        .single()

      await supabase.from('inventory_movements').insert({
        product_id:    product.id,
        entity_id:     entityId,
        movement_type: 'RESTOCK',
        quantity:      openingStock,
        batch_id:      batch?.id ?? null,
        notes:         `Opening stock — Batch ${batchNo}`,
      })
    }

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

    // Update package definition. stocked_as_unit is only written when the client sends it
    // (vendor edits), so retailer package edits leave the flag untouched. Opening stock is not
    // re-set on edit — on-hand is moved via Open / inventory movements, never overwritten here.
    const pkgUpdate = {
      name:            formData.name.trim(),
      package_type:    formData.package_type,
      barcode:         formData.barcode?.trim() || null,
      qr_code:         formData.qr_code?.trim() || null,
      wholesale_price: parseFloat(formData.wholesale_price) || 0,
      mrp:             parseFloat(formData.mrp) || 0,
      hsn_code:        formData.hsn_code?.trim() || null,
    }
    if (formData.stocked_as_unit !== undefined) pkgUpdate.stocked_as_unit = !!formData.stocked_as_unit

    const { error } = await supabase.from('product_packages').update(pkgUpdate).eq('id', packageId)

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
