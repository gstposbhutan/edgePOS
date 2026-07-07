// z.ai (GLM) product AI — metadata enrichment (glm-5.2, or glm-4.6v when given a photo) + default
// catalog image generation (cogview). z.ai speaks the OpenAI-compatible API, so we call it directly.
// Server-only (needs the secret key). Values come from .env.docker (ZAI_*).

const BASE = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4'
const KEY = process.env.ZAI_API_KEY
const TEXT_MODEL = process.env.ZAI_TEXT_MODEL || 'glm-5.2'
const VISION_MODEL = process.env.ZAI_VISION_MODEL || 'glm-4.6v'
const IMAGE_MODEL = process.env.ZAI_IMAGE_MODEL || 'cogview-4-250304'

const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'For parts']

function aiConfigured() {
  return !!KEY && !KEY.startsWith('replace')
}

async function chat(messages, { model = TEXT_MODEL, maxTokens = 2000 } = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    // Disable GLM "thinking" — we want the JSON answer directly (faster, and no reasoning tokens
    // eating the budget / producing empty content).
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.5, thinking: { type: 'disabled' } }),
  })
  if (!res.ok) throw new Error(`z.ai chat ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

function extractJson(raw) {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('AI did not return JSON')
  return JSON.parse(m[0])
}

/**
 * Enrich one product. Uses the vision model when an imageUrl is supplied (reads the photo),
 * otherwise the text model works from the name alone. Returns normalised metadata fields.
 */
async function enrichProduct({ name, category, condition, price, imageUrl }) {
  const sys = 'You are a product cataloguer for a Bhutanese marketplace that mostly sells used / second-hand goods. Be factual and concise. Return STRICT JSON only, no prose, no code fences.'
  const shape = `Return JSON with exactly these keys:
{"description": "1-2 factual buyer-facing sentences",
 "category": "broad category label, e.g. Furniture, Electronics, Textiles, Bathroom",
 "subcategory": "more specific type, e.g. Bed, Television, Curtain, Towel",
 "hsn_code": "the most likely 4-8 digit HSN/GST code for this item (digits only, dots allowed)",
 "condition": ${JSON.stringify(CONDITIONS)} (pick one),
 "brand": "brand name or null if unknown",
 "tags": ["3-6","lowercase","keywords"],
 "specifications": {"key":"value"}}`
  const userText = [
    `Product name: "${name}"`,
    category ? `Current category: ${category}` : '',
    condition ? `Current condition: ${condition}` : '',
    price ? `Price: Nu. ${price}` : '',
    '',
    shape,
    'Rules:',
    '- Do NOT invent a brand if it is not obvious; keep everything realistic for a used item.',
    '- "specifications" are custom properties RELEVANT TO THE CATEGORY (furniture: material, dimensions, weight; textiles: fabric, size, colour; electronics: screen size, power, voltage, warranty). Use {} only if truly unknown.',
    '- "hsn_code" should be the correct Bhutan/India GST HSN classification for the item type (e.g. wooden furniture 9403, mattresses 9404, television 8528, towels 6302).',
  ].filter(Boolean).join('\n')

  const useVision = !!imageUrl
  const content = useVision
    ? [{ type: 'image_url', image_url: { url: imageUrl } }, { type: 'text', text: userText }]
    : userText

  const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content }], {
    model: useVision ? VISION_MODEL : TEXT_MODEL,
  })
  const j = extractJson(raw)

  const cond = CONDITIONS.find(c => c.toLowerCase() === String(j.condition || '').toLowerCase())
  return {
    description: typeof j.description === 'string' ? j.description.trim() : null,
    category: typeof j.category === 'string' && j.category.trim() ? j.category.trim() : (category || null),
    subcategory: typeof j.subcategory === 'string' && j.subcategory.trim() ? j.subcategory.trim() : null,
    hsn_code: j.hsn_code ? String(j.hsn_code).trim() : null,
    condition: cond || condition || null,
    brand: j.brand && String(j.brand).toLowerCase() !== 'null' ? String(j.brand).trim() : null,
    tags: Array.isArray(j.tags) ? j.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 6) : [],
    specifications: (j.specifications && typeof j.specifications === 'object' && !Array.isArray(j.specifications)) ? j.specifications : {},
  }
}

/**
 * Resolve an AI-suggested HSN code to a row in hsn_master (best-effort, by digit prefix).
 * Returns { hsn_master_id, hsn_code, category } or null. `supabase` is the caller's client.
 */
async function resolveHsn(supabase, rawCode) {
  const digits = String(rawCode || '').replace(/\D/g, '')
  if (digits.length < 4) return null
  // Try progressively shorter prefixes (8 → 6 → 4) against the dotted/8-digit codes.
  for (const len of [8, 6, 4]) {
    const prefix = digits.slice(0, len)
    if (prefix.length < 4) continue
    const { data } = await supabase
      .from('hsn_master')
      .select('id, code, code_8digit, category')
      .or(`code_8digit.like.${prefix}%,code.like.${prefix}%`)
      .limit(1)
    if (data && data.length) {
      return { hsn_master_id: data[0].id, hsn_code: data[0].code_8digit || data[0].code, category: data[0].category }
    }
  }
  return null
}

/** Generate a default catalog image; returns z.ai's temporary image URL (caller re-hosts to S3). */
async function generateImageUrl({ name, description }) {
  const prompt = `Clean e-commerce product catalog photo of "${name}"${description ? `, ${description}` : ''}. Single item centered, plain white studio background, soft even lighting, realistic, no text, no watermark, no people.`
  const res = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt }),
  })
  if (!res.ok) throw new Error(`z.ai image ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const data = await res.json()
  return data?.data?.[0]?.url || null
}

module.exports = { aiConfigured, enrichProduct, generateImageUrl, resolveHsn, CONDITIONS }
