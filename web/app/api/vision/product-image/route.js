import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/vision/product-image?id=<productId>
 *
 * The product's photo, streamed through this origin so the camera pad can embed it.
 *
 * Why this exists rather than loading img.pelbu.com directly: the embedder has to READ PIXELS
 * out of the image, which requires an untainted canvas, which requires either a same-origin
 * image or a cross-origin one served with Access-Control-Allow-Origin. The CDN sends no CORS
 * headers, so an `<img crossOrigin="anonymous">` against it fails outright — every product
 * silently unembeddable, catalog empty, nothing ever recognised. Fixing it here needs no
 * CloudFront change.
 *
 * The URL is resolved from the product row, never taken from the request, so this cannot be
 * used as an open proxy — and the product must belong to the caller's shop.
 *
 * Cost is one fetch per product per image change: the pad caches the resulting vector in
 * IndexedDB and only re-embeds when the photo itself changes.
 */
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: product } = await ctx.supabase
    .from('products')
    .select('image_url')
    .eq('id', id)
    .eq('created_by', ctx.entityId)   // pos.products scopes by created_by, not entity_id
    .maybeSingle()

  if (!product?.image_url) {
    return NextResponse.json({ error: 'No image for that product' }, { status: 404 })
  }

  let upstream
  try {
    upstream = await fetch(product.image_url)
  } catch (err) {
    return NextResponse.json({ error: `Image fetch failed: ${err.message}` }, { status: 502 })
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: `Image fetch failed: HTTP ${upstream.status}` }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      // The catalog pass runs on every till load; let the browser keep these.
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
