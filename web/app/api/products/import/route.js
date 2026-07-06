import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { parseWorkbook, MAX_DATA_ROWS } from '@/lib/marketplace/product-import'

// POST /api/products/import — vendor self-serve bulk product import from the filled .xlsx template.
// multipart/form-data with `file`. Add ?dryRun=1 to validate + preview only (no writes).
// All-or-nothing: if any row is invalid the whole import is rejected so the vendor fixes + re-uploads.
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { entityId, supabase } = ctx

    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())

    let parsed
    try {
      parsed = await parseWorkbook(buffer)
    } catch {
      return NextResponse.json({ error: 'Could not read the file. Please upload the .xlsx template.' }, { status: 400 })
    }
    const { rows, errors, total } = parsed

    if (total > MAX_DATA_ROWS) {
      return NextResponse.json({ error: `Too many rows (${total}). Import up to ${MAX_DATA_ROWS} at a time.` }, { status: 400 })
    }

    if (dryRun) {
      return NextResponse.json({ total, valid: rows.length, errors, sample: rows.slice(0, 8) })
    }

    if (errors.length) {
      return NextResponse.json({ error: 'Some rows have errors — fix them and re-upload.', errors, total }, { status: 422 })
    }
    if (!rows.length) {
      return NextResponse.json({ error: 'No products found in the file.' }, { status: 400 })
    }

    const created = []
    const failed = []
    let seq = 0

    for (const row of rows) {
      const sku = row.sku || `IMP-${Date.now().toString(36)}-${seq++}`
      try {
        const { data: product, error } = await supabase
          .from('products')
          .insert({
            name:            row.name,
            sku,
            barcode:         row.barcode,
            hsn_code:        row.hsn_code,
            unit:            row.unit,
            category:        row.category,
            condition:       row.condition,
            description:     row.description,
            selling_price:   row.selling_price,
            mrp:             row.mrp,
            current_stock:   row.current_stock,
            image_url:       row.image_url,
            visible_on_web:  row.visible_on_web,
            is_active:       true,
            created_by:      entityId,
          })
          .select('id')
          .single()

        if (error) { failed.push({ name: row.name, message: error.message }); continue }

        // Opening batch + RESTOCK movement so stock is tracked like a normal create.
        if (row.current_stock > 0) {
          const batchNo = `IMP-${Date.now().toString(36)}-${seq}`
          const { data: batch } = await supabase
            .from('product_batches')
            .insert({
              product_id:   product.id,
              entity_id:    entityId,
              batch_number: batchNo,
              quantity:     row.current_stock,
              selling_price: row.selling_price,
              mrp:          row.mrp,
              status:       'ACTIVE',
              notes:        'Imported opening stock',
            })
            .select('id')
            .single()

          await supabase.from('inventory_movements').insert({
            product_id:    product.id,
            entity_id:     entityId,
            movement_type: 'RESTOCK',
            quantity:      row.current_stock,
            batch_id:      batch?.id ?? null,
            notes:         'Product import',
          })
        }

        created.push(product.id)
      } catch (err) {
        failed.push({ name: row.name, message: err.message })
      }
    }

    return NextResponse.json({ imported: created.length, failed, total: rows.length })
  } catch (err) {
    console.error('[products/import] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
