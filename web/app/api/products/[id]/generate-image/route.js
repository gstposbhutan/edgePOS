import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { aiConfigured, generateImageUrl } from '@/lib/ai/product-ai'
import { uploadProductImage, isStorageConfigured } from '@/lib/storage/s3'

export const runtime = 'nodejs'

// POST /api/products/[id]/generate-image — generate a default catalog image with GLM/cogview,
// re-host it to our S3/CDN, and set it as the product image. Scoped to the caller's own catalog.
export async function POST(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!aiConfigured()) return NextResponse.json({ error: 'AI is not configured on this server' }, { status: 503 })
    if (!isStorageConfigured()) return NextResponse.json({ error: 'Image storage is not configured' }, { status: 503 })

    const { entityId, supabase } = ctx
    const { id } = await params

    const { data: product, error } = await supabase
      .from('products')
      .select('id, name, description, created_by')
      .eq('id', id)
      .eq('created_by', entityId)
      .single()
    if (error || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const tempUrl = await generateImageUrl({ name: product.name, description: product.description })
    if (!tempUrl) return NextResponse.json({ error: 'Image generation returned nothing' }, { status: 502 })

    // Re-host the generated image on our CDN (z.ai URLs are temporary).
    const imgRes = await fetch(tempUrl)
    if (!imgRes.ok) return NextResponse.json({ error: 'Could not fetch generated image' }, { status: 502 })
    const mime = imgRes.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const { url } = await uploadProductImage(buffer, mime)

    const { data: updated, error: upErr } = await supabase
      .from('products')
      .update({ image_url: url })
      .eq('id', id)
      .eq('created_by', entityId)
      .select('id, image_url')
      .single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ product: updated })
  } catch (err) {
    console.error('[products/generate-image] error:', err.message)
    return NextResponse.json({ error: 'Image generation failed' }, { status: 502 })
  }
}
