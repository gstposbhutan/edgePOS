import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { uploadProductImage, isAllowedImageType, isStorageConfigured } from '@/lib/storage/s3'

// Needs Node APIs (Buffer, crypto, AWS SDK) — not the edge runtime.
export const runtime = 'nodejs'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

/** POST /api/uploads/product-image — multipart upload, returns the CDN URL. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: 'Image uploads are not configured on this server' }, { status: 503 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const mime = file.type
    if (!isAllowedImageType(mime)) {
      return NextResponse.json(
        { error: `Unsupported image type${mime ? ` (${mime})` : ''}. Use JPEG, PNG, WebP, AVIF or GIF.` },
        { status: 415 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `Image too large (max ${MAX_BYTES / (1024 * 1024)} MB)` }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { url, key } = await uploadProductImage(buffer, mime)
    return NextResponse.json({ url, key }, { status: 201 })
  } catch (err) {
    console.error('[uploads/product-image] POST error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
