/**
 * Server-only payment screenshot OCR verification.
 * Shared by /api/payment-verify (POS) and /api/shop/pay/[orderId] (marketplace).
 *
 * Uses Zhipu GLM-4V as primary, Gemini 1.5 Flash as fallback.
 * Provider override via VISION_AI_PROVIDER env var: 'zhipu' | 'gemini'
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

async function verifyWithZhipu(imageBase64, mimeType, expectedAmount) {
  const ZhipuAI = (await import('zhipuai')).default
  const client = new ZhipuAI({ apiKey: process.env.ZHIPU_API_KEY })

  const response = await client.chat.completions.create({
    model: 'glm-4v-flash',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        { type: 'text', text: PROMPT(expectedAmount) },
      ],
    }],
    max_tokens: 512,
  })

  return response.choices[0]?.message?.content ?? ''
}

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

function parseOcrResponse(rawText, provider) {
  const jsonStr = rawText
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim()

  const parsed = JSON.parse(jsonStr)

  const verified =
    parsed.status === 'SUCCESS' &&
    parsed.amountMatches === true &&
    (parsed.confidence ?? 0) >= 0.70

  const verifyId = verified
    ? `OCR-${provider.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    : null

  return {
    verified,
    extractedAmount: parsed.extractedAmount,
    referenceNo: parsed.referenceNo,
    paymentMethod: parsed.paymentMethod,
    confidence: parsed.confidence,
    verifyId,
    reason: parsed.reason,
    status: parsed.status,
    provider,
  }
}

/**
 * Verify a payment screenshot using vision AI.
 * @param {{ imageBase64: string, mimeType: string, expectedAmount: number }} params
 * @returns {Promise<{ verified: boolean, extractedAmount: number|null, referenceNo: string|null, paymentMethod: string|null, verifyId: string|null, confidence: number, reason: string, provider: string }>}
 */
export async function verifyPaymentImage({ imageBase64, mimeType = 'image/jpeg', expectedAmount }) {
  const provider = process.env.VISION_AI_PROVIDER ?? 'zhipu'

  const zhipuKeyMissing = !process.env.ZHIPU_API_KEY || process.env.ZHIPU_API_KEY.startsWith('replace')
  const geminiKeyMissing = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('replace')

  if (provider === 'zhipu' && zhipuKeyMissing) {
    throw new Error('Zhipu API key not configured')
  }
  if (provider === 'gemini' && geminiKeyMissing) {
    throw new Error('Gemini API key not configured')
  }

  try {
    const rawText = provider === 'zhipu'
      ? await verifyWithZhipu(imageBase64, mimeType, expectedAmount)
      : await verifyWithGemini(imageBase64, mimeType, expectedAmount)

    return parseOcrResponse(rawText, provider)
  } catch (err) {
    // Auto-fallback: Zhipu failed → try Gemini
    if (provider === 'zhipu' && !geminiKeyMissing) {
      console.log('[server-payment-ocr] Zhipu failed, falling back to Gemini:', err.message)
      const rawText = await verifyWithGemini(imageBase64, mimeType, expectedAmount)
      return parseOcrResponse(rawText, 'gemini-fallback')
    }
    throw err
  }
}
