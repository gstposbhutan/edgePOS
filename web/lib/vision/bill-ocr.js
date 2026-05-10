/**
 * Bill OCR Library
 *
 * Extracts structured line items from wholesale bill photos using Gemini Vision,
 * then fuzzy-matches each item against the store's product catalog.
 *
 * @module vision/bill-ocr
 */

const BILL_PROMPT = `You are a wholesale bill parser for a Bhutan POS system (NEXUS BHUTAN).

Analyze this photo of a wholesale delivery note or bill. The bill may be
handwritten, printed, or a mix of both. It may contain text in English and/or
Dzongkha script.

Extract the following information:

1. Supplier name (usually printed at the top of the bill as a letterhead or header)
2. Bill date (YYYY-MM-DD format)
3. Each line item:
   - Product name (as written on the bill; transliterate Dzongkha to English where possible)
   - Quantity (numeric)
   - Unit (pcs, pkt, ctn, box, bag, kg, ltr, or as written)
   - Unit price (numeric, per unit)
   - Line total (quantity x unit price)
4. Grand total on the bill

Rules:
- If a field is unclear or unreadable, set it to null rather than guessing.
- Preserve the original product name spelling even if it seems misspelled.
- If line total and quantity x unit price do not match, report both values.
- Include ALL line items, even if partially readable.

Respond ONLY with valid JSON, no markdown:
{
  "supplier_name": "<string or null>",
  "bill_date": "<YYYY-MM-DD or null>",
  "items": [
    {
      "name": "<string>",
      "quantity": <number or null>,
      "unit": "<string or null>",
      "unit_price": <number or null>,
      "total_price": <number or null>
    }
  ],
  "grand_total": <number or null>,
  "confidence": <0.0 to 1.0>
}`

/**
 * Extract line items from a bill photo using Gemini Vision.
 * @param {string} imageBase64 - Base64-encoded image data
 * @param {string} mimeType - MIME type (e.g. 'image/jpeg')
 * @returns {Promise<{supplier_name: string|null, bill_date: string|null, items: Array, grand_total: number|null, confidence: number}>}
 */
export async function extractBillItems(imageBase64, mimeType) {
  const provider = process.env.VISION_AI_PROVIDER ?? 'gemini'

  let rawText

  if (provider === 'zhipu' && process.env.ZHIPU_API_KEY && !process.env.ZHIPU_API_KEY.startsWith('replace')) {
    rawText = await extractWithZhipu(imageBase64, mimeType)
  } else if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('replace')) {
    rawText = await extractWithGemini(imageBase64, mimeType)
  } else {
    throw new Error('No Vision AI API key configured. Set GEMINI_API_KEY or ZHIPU_API_KEY.')
  }

  const jsonStr = rawText
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim()

  try {
    return JSON.parse(jsonStr)
  } catch {
    throw new Error(`Failed to parse OCR response: ${jsonStr.slice(0, 200)}`)
  }
}

async function extractWithGemini(imageBase64, mimeType) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { maxOutputTokens: 2048 } })

  const result = await model.generateContent([
    BILL_PROMPT,
    { inlineData: { mimeType, data: imageBase64 } },
  ])

  return result.response.text()
}

async function extractWithZhipu(imageBase64, mimeType) {
  const ZhipuAI = (await import('zhipuai')).default
  const client = new ZhipuAI({ apiKey: process.env.ZHIPU_API_KEY })

  const response = await client.chat.completions.create({
    model: 'glm-4v-flash',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: BILL_PROMPT },
        ],
      },
    ],
    max_tokens: 2048,
  })

  return response.choices[0]?.message?.content ?? ''
}

/**
 * Fuzzy-match OCR items against a store's product catalog using pg_trgm.
 * Threshold is 0.6 (lower than WhatsApp's 0.7) because OCR text is noisier.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} entityId
 * @param {Array<{name: string, quantity: number, unit: string, unit_price: number, total_price: number}>} ocrItems
 * @returns {Promise<Array<{name: string, quantity: number, unit: string, unit_price: number, total_price: number, product_id: string|null, matched_name: string|null, match_confidence: number, match_status: string}>>}
 */
export async function fuzzyMatchItems(supabase, entityId, ocrItems) {
  const results = []

  for (const item of ocrItems) {
    const { data: matches } = await supabase.rpc('fuzzy_match_product', {
      p_name: item.name,
      p_entity_id: entityId,
      p_threshold: 0.6,
    })

    if (matches && matches.length > 0) {
      const best = matches[0]
      const confidence = parseFloat(best.score)
      results.push({
        ...item,
        product_id: best.id,
        matched_name: best.name,
        match_confidence: confidence,
        match_status: confidence >= 0.85 ? 'MATCHED' : 'PARTIAL',
      })
    } else {
      results.push({
        ...item,
        product_id: null,
        matched_name: null,
        match_confidence: 0,
        match_status: 'UNMATCHED',
      })
    }
  }

  return results
}
