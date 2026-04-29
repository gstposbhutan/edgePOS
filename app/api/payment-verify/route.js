import { NextResponse } from 'next/server'
import { verifyPaymentImage } from '@/lib/vision/server-payment-ocr'

/**
 * POST /api/payment-verify
 * Server-side vision OCR for payment screenshot verification.
 * Provider selected via VISION_AI_PROVIDER env var: 'zhipu' | 'gemini'
 *
 * Body:    { imageBase64: string, mimeType: string, expectedAmount: number }
 * Returns: { verified, extractedAmount, referenceNo, verifyId, confidence, reason }
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ verified: false, reason: 'Invalid request body' }, { status: 400 })
  }

  const { imageBase64, mimeType = 'image/jpeg', expectedAmount } = body

  if (!imageBase64 || !expectedAmount) {
    return NextResponse.json({ verified: false, reason: 'Missing image or expected amount' }, { status: 400 })
  }

  try {
    const result = await verifyPaymentImage({ imageBase64, mimeType, expectedAmount })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[PaymentVerify] Error:', err)
    return NextResponse.json(
      { verified: false, reason: err.message },
      { status: err.message.includes('not configured') ? 503 : 500 }
    )
  }
}
