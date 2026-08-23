import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/vision/product-embeddings
 *
 * The shop's catalog, for the camera pad to recognise against: everything active that has a
 * picture, because a picture is what an embedding can be computed from.
 *
 * The vectors are NOT sent from here. `products.image_embedding` is a 1536-dim column meant for
 * text/LLM search, while the pad compares against a vector produced by MediaPipe's image
 * embedder from the camera crop — different models, different spaces, so a cosine similarity
 * between them is noise, not a match. The pad embeds these images itself with the SAME embedder
 * it runs on crops, which is the only way the two are comparable, and caches the result in
 * IndexedDB so it is computed once per product image.
 *
 * NOTE: pos.products is scoped by `created_by`, not `entity_id` — there is no entity_id column
 * on it. Filtering on one made this route 500, and the store swallowed that as "0 products",
 * which is why nothing was ever recognised.
 */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = ctx.supabase
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, image_url, updated_at')
    .eq('created_by', ctx.entityId)
    .eq('is_active', true)
    .not('image_url', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const products = data ?? []
  return NextResponse.json({
    products,
    // Surfaced so the pad can say "12 of 300 products have a photo" rather than leaving a
    // shopkeeper wondering why most of the shelf is never recognised.
    coverage: { withImage: products.length },
  })
}
