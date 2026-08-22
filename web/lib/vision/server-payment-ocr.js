/**
 * Server-only payment screenshot OCR verification.
 * Shared by /api/payment-verify (POS) and /api/shop/pay/[orderId] (marketplace).
 *
 * Uses Zhipu GLM-4V as primary, Gemini 1.5 Flash as fallback.
 * Provider override via VISION_AI_PROVIDER env var: 'zhipu' | 'gemini'
 */

const PROMPT = (expectedAmount) =>
  `You are a payment verification assistant for a Bhutan POS system (Pelbu).

FIRST decide: is this image ACTUALLY a bank / mobile-wallet PAYMENT CONFIRMATION
screenshot (e.g. mBoB, mPay, RTGS, e-banking transfer receipt)? If it is anything
else — a random photo, a product, a chat, a blank/garbled image, or a screenshot with
no transaction — set "isPaymentConfirmation" to false and everything else to null/false.

If it IS a payment confirmation, extract:
1. Transaction amount (numeric value only, no currency symbols)
2. Transaction / journal / reference number — the EXACT string shown on the receipt.
   Do NOT invent one. If none is visible, set referenceNo to null.
3. Payment method (mBoB, mPay, RTGS, or other)
4. Transaction status (SUCCESS, FAILED, PENDING)
5. Whether the amount matches the expected amount of Nu. ${expectedAmount}

Respond ONLY with valid JSON in this exact format, no markdown:
{
  "isPaymentConfirmation": <true | false>,
  "status": "SUCCESS" | "FAILED" | "PENDING" | "UNREADABLE",
  "extractedAmount": <number or null>,
  "referenceNo": "<string or null>",
  "paymentMethod": "<string or null>",
  "amountMatches": <true | false>,
  "confidence": <0.0 to 1.0>,
  "reason": "<brief explanation in English>"
}`

async function verifyWithZhipu(imageBase64, mimeType, expectedAmount) {
  // ZhipuAI is a NAMED export (the package has no default) — `.default` is
  // undefined and `new undefined()` threw "not a constructor" on every verify.
  const zhipuMod = await import('zhipuai')
  const ZhipuAI = zhipuMod.ZhipuAI ?? zhipuMod.default?.ZhipuAI ?? zhipuMod.default
  const client = new ZhipuAI({ apiKey: process.env.ZHIPU_API_KEY })

  const response = await client.chat.completions.create({
    model: process.env.ZHIPU_VISION_MODEL || 'glm-4.6v',
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

  // Reject anything that isn't a genuine payment confirmation with a readable journal number.
  const isPayment = parsed.isPaymentConfirmation !== false   // default true if the model omits it
  const rawRef = typeof parsed.referenceNo === 'string' ? parsed.referenceNo.trim() : ''
  const compactRef = rawRef.replace(/\s+/g, '')
  // A valid journal/reference: ≥5 chars, alphanumeric (dashes/slashes allowed) — nothing else.
  const journalValid = compactRef.length >= 5 && /^[A-Za-z0-9/-]+$/.test(compactRef)
  const usable = isPayment && parsed.status !== 'UNREADABLE' && journalValid

  // Only surface a reference number when the screenshot is actually usable — so a random image
  // can't slip through with a hallucinated number.
  const referenceNo = usable ? rawRef : null

  const verified =
    usable &&
    parsed.status === 'SUCCESS' &&
    parsed.amountMatches === true &&
    (parsed.confidence ?? 0) >= 0.70

  // Clear, specific rejection reasons.
  let reason = parsed.reason
  if (!isPayment) reason = "This doesn't look like a payment confirmation screenshot."
  else if (parsed.status === 'UNREADABLE') reason = reason || 'The screenshot was unreadable — try a clearer image.'
  else if (!journalValid) reason = 'No valid transaction / journal number found — check the screenshot or enter it manually.'

  const verifyId = verified
    ? `OCR-${provider.toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    : null

  return {
    verified,
    isPaymentConfirmation: isPayment,
    extractedAmount: usable ? parsed.extractedAmount : null,
    referenceNo,
    paymentMethod: parsed.paymentMethod,
    confidence: parsed.confidence,
    verifyId,
    reason,
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
