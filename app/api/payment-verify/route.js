import { NextResponse } from 'next/server'

/**
 * POST /api/payment-verify
 * Server-side vision OCR for payment screenshot verification.
 * Provider selected via VISION_AI_PROVIDER env var: 'zhipu' | 'gemini'
 *
 * Body:    { imageBase64: string, mimeType: string, expectedAmount: number }
 * Returns: { verified, extractedAmount, referenceNo, verifyId, confidence, reason }
 */

const PROMPT = (expectedAmount) =>
  `You are a payment verification assistant for a Bhutan POS system (NEXUS BHUTAN).

Analyze this payment confirmation screenshot and extract:
1. Transaction amount (numeric value only, no currency symbols)
2. Transaction/reference number
3. Payment method (mBoB, mPay, RTGS, or other)
4. Transaction status (SUCCESS, FAILED, PENDING)
5. Whether the amount matches the expected amount of Nu. ${expectedAmount}

Respond ONLY with valid JSON in this exact format, no markdown:
{
  "status": "SUCCESS" | "FAILED" | "PENDING" | "UNREADABLE",
  "extractedAmount": <number or null>,
  "referenceNo": "<string or null>",
  "paymentMethod": "<string or null>",
  "amountMatches": <true | false>,
  "confidence": <0.0 to 1.0>,
  "reason": "<brief explanation in English>"
}`

// ─── Zhipu AI (GLM-4V) ────────────────────────────────────────────────────

async function verifyWithZhipu(imageBase64, mimeType, expectedAmount) {
  const ZhipuAI = (await import('zhipuai')).default

  const client = new ZhipuAI({ apiKey: process.env.ZHIPU_API_KEY })

  const response = await client.chat.completions.create({
    model:    'glm-4v-flash',   // GLM-4V-Flash: fast + cheap. Use glm-4v for max accuracy.
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
          {
            type: 'text',
            text: PROMPT(expectedAmount),
          },
        ],
      },
    ],
    max_tokens: 512,
  })

  return response.choices[0]?.message?.content ?? ''
}

// ─── Gemini (fallback) ────────────────────────────────────────────────────

async function verifyWithGemini(imageBase64, mimeType, expectedAmount) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const result = await model.generateContent([
    PROMPT(expectedAmount),
    { inlineData: { mimeType, data: imageBase64 } },
  ])

  return result.response.text()
}

// ─── Route handler ────────────────────────────────────────────────────────

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

  const provider = process.env.VISION_AI_PROVIDER ?? 'zhipu'

  // Validate API keys
  if (provider === 'zhipu' && (!process.env.ZHIPU_API_KEY || process.env.ZHIPU_API_KEY.startsWith('replace'))) {
    return NextResponse.json({ verified: false, reason: 'Zhipu API key not configured' }, { status: 503 })
  }
  if (provider === 'gemini' && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('replace'))) {
    return NextResponse.json({ verified: false, reason: 'Gemini API key not configured' }, { status: 503 })
  }

  try {
    // Call selected provider
    let rawText
    if (provider === 'zhipu') {
      rawText = await verifyWithZhipu(imageBase64, mimeType, expectedAmount)
    } else {
      rawText = await verifyWithGemini(imageBase64, mimeType, expectedAmount)
    }

    // Strip markdown code fences if present
    const jsonStr = rawText
      .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim()

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({
        verified: false,
        reason:   'Could not parse AI response — screenshot may be unclear',
        rawOutput: rawText,
      })
    }

    const verified =
      parsed.status      === 'SUCCESS' &&
      parsed.amountMatches === true    &&
      (parsed.confidence ?? 0) >= 0.70

    const verifyId = verified
      ? `OCR-${provider.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`
      : null

    return NextResponse.json({
      verified,
      extractedAmount: parsed.extractedAmount,
      referenceNo:     parsed.referenceNo,
      paymentMethod:   parsed.paymentMethod,
      confidence:      parsed.confidence,
      verifyId,
      reason:          parsed.reason,
      status:          parsed.status,
      provider,
    })

  } catch (err) {
    console.error(`[PaymentVerify/${provider}] Error:`, err)

    // Auto-fallback: if Zhipu fails, try Gemini
    if (provider === 'zhipu' && process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('replace')) {
      try {
        console.log('[PaymentVerify] Falling back to Gemini...')
        const rawText = await verifyWithGemini(imageBase64, mimeType, expectedAmount)
        const jsonStr = rawText.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim()
        const parsed  = JSON.parse(jsonStr)
        const verified = parsed.status === 'SUCCESS' && parsed.amountMatches === true && (parsed.confidence ?? 0) >= 0.70
        return NextResponse.json({
          verified,
          extractedAmount: parsed.extractedAmount,
          referenceNo:     parsed.referenceNo,
          confidence:      parsed.confidence,
          verifyId:        verified ? `OCR-GEMINI-FALLBACK-${Date.now()}` : null,
          reason:          parsed.reason,
          provider:        'gemini-fallback',
        })
      } catch (fallbackErr) {
        console.error('[PaymentVerify] Gemini fallback also failed:', fallbackErr)
      }
    }

    return NextResponse.json(
      { verified: false, reason: `Verification error: ${err.message}` },
      { status: 500 }
    )
  }
}
