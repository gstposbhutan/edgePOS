import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { aiConfigured, enrichProduct, resolveHsn } from '@/lib/ai/product-ai'

export const runtime = 'nodejs'

// POST /api/products/[id]/enrich — fill in metadata (description, category, condition, brand, tags,
// specifications) for one of the caller's products using the GLM engine. Reads the product photo
// when it has one (vision), else works from the name.
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!aiConfigured()) return NextResponse.json({ error: 'AI is not configured on this server' }, { status: 503 })

    const { entityId, supabase } = ctx
    const { id } = await params

    const { data: product, error } = await supabase
      .from('products')
      .select('id, name, category, subcategory, condition, hsn_code, selling_price, image_url, created_by')
      .eq('id', id)
      .eq('created_by', entityId)   // only your own catalog
      .single()
    if (error || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const meta = await enrichProduct({
      name: product.name,
      category: product.category,
      condition: product.condition,
      price: product.selling_price,
      imageUrl: product.image_url || undefined,
    })

    // Resolve the suggested HSN to the classification table (authoritative code + category).
    const hsn = meta.hsn_code ? await resolveHsn(supabase, meta.hsn_code) : null

    const { data: updated, error: upErr } = await supabase
      .from('products')
      .update({
        description: meta.description,
        category: hsn?.category || meta.category,
        subcategory: meta.subcategory,
        condition: meta.condition,
        brand: meta.brand,
        tags: meta.tags,
        specifications: meta.specifications,
        hsn_code: hsn?.hsn_code || meta.hsn_code || product.hsn_code || '',
        hsn_master_id: hsn?.hsn_master_id ?? undefined,
        ai_enriched: true,
      })
      .eq('id', id)
      .eq('created_by', entityId)
      .select('id, description, category, subcategory, condition, brand, tags, specifications, hsn_code, ai_enriched')
      .single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ product: updated })
  } catch (err) {
    console.error('[products/enrich] error:', err.message)
    return NextResponse.json({ error: 'AI enrichment failed' }, { status: 502 })
  }
}
