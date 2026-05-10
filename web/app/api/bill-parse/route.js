import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { extractBillItems, fuzzyMatchItems } from '@/lib/vision/bill-ocr'

/**
 * POST /api/bill-parse
 * Accepts a bill photo, runs OCR via Gemini Vision, fuzzy-matches items
 * against the product catalog, and creates a draft purchase.
 *
 * Body: { imageBase64: string, mimeType: string, entityId: string, createdBy?: string }
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { imageBase64, mimeType = 'image/jpeg', entityId, createdBy } = body

  if (!imageBase64 || !entityId) {
    return NextResponse.json({ error: 'imageBase64 and entityId required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Duplicate detection via SHA-256 hash
  const crypto = await import('crypto')
  const hash = crypto.createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex')

  const { data: existing } = await supabase
    .from('draft_purchases')
    .select('id')
    .eq('entity_id', entityId)
    .eq('bill_photo_hash', hash)
    .eq('status', 'DRAFT')
    .maybeSingle()

  if (existing) {
    const { data: draft } = await supabase
      .from('draft_purchases')
      .select('*, draft_purchase_items(*)')
      .eq('id', existing.id)
      .single()

    return NextResponse.json({ draft, duplicate: true })
  }

  // Run OCR
  let ocrResult
  try {
    ocrResult = await extractBillItems(imageBase64, mimeType)
  } catch (err) {
    return NextResponse.json({ error: `OCR failed: ${err.message}` }, { status: 500 })
  }

  if (!ocrResult.items || ocrResult.items.length === 0) {
    return NextResponse.json({ error: 'No items found on bill' }, { status: 422 })
  }

  // Upload photo to Supabase Storage
  const photoPath = `${entityId}/${hash}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('bill-photos')
    .upload(photoPath, Buffer.from(imageBase64, 'base64'), {
      contentType: mimeType,
      upsert: true,
    })

  const { data: urlData } = uploadError
    ? null
    : supabase.storage.from('bill-photos').getPublicUrl(photoPath)

  const photoUrl = urlData?.publicUrl ?? null

  // Fuzzy-match items against product catalog
  const matchedItems = await fuzzyMatchItems(supabase, entityId, ocrResult.items)

  // Create draft purchase
  const { data: draft, error: draftError } = await supabase
    .from('draft_purchases')
    .insert({
      entity_id: entityId,
      status: 'DRAFT',
      supplier_name: ocrResult.supplier_name || null,
      bill_date: ocrResult.bill_date || null,
      bill_photo_url: photoUrl,
      bill_photo_hash: hash,
      total_amount: ocrResult.grand_total || 0,
      ocr_raw: ocrResult,
      created_by: createdBy || null,
    })
    .select()
    .single()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Failed to create draft purchase' }, { status: 500 })
  }

  // Create draft purchase items
  const items = matchedItems.map((item, i) => ({
    draft_purchase_id: draft.id,
    product_id: item.product_id,
    raw_name: item.name,
    quantity: item.quantity || 1,
    unit: item.unit || 'pcs',
    unit_price: item.unit_price || 0,
    total_price: item.total_price || (item.unit_price || 0) * (item.quantity || 1),
    match_confidence: item.match_confidence,
    match_status: item.match_status,
    sort_order: i,
  }))

  const { data: insertedItems } = await supabase
    .from('draft_purchase_items')
    .insert(items)
    .select()

  return NextResponse.json({
    draft: { ...draft, draft_purchase_items: insertedItems ?? [] },
    duplicate: false,
  })
}
