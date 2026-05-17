import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/vision/product-embeddings
 *
 * Fetches product embeddings for local sync. Returns only products
 * with image_embedding set and is_active = true.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, image_embedding')
    .eq('entity_id', ctx.entityId)
    .not('image_embedding', 'is', null)
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data ?? [] })
}
