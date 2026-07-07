#!/usr/bin/env node
/**
 * One-time generator for the marketing site's AI imagery.
 *
 * Uses z.ai / GLM cogview (the same image model as product enrichment) to render
 * a set of photoreal hero images + illustrated feature spots, then re-encodes each
 * to a right-sized webp under web/public/marketing/. Run from the web/ dir:
 *
 *   node scripts/gen-marketing-images.js            # generate all (skips existing)
 *   FORCE=1 node scripts/gen-marketing-images.js    # regenerate everything
 *
 * Reads ZAI_* from web/.env.docker. Assets are static (checked into the repo) so the
 * marketing pages never depend on the CDN or image gen at runtime.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// ── load ZAI_* from .env.docker (no dotenv dep) ──────────────────────────────
const envPath = path.join(__dirname, '..', '.env.docker')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && m[1].startsWith('ZAI_')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const BASE = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4'
const KEY = process.env.ZAI_API_KEY
const IMAGE_MODEL = process.env.ZAI_IMAGE_MODEL || 'cogview-4-250304'
if (!KEY) { console.error('ZAI_API_KEY missing'); process.exit(1) }

const OUT = path.join(__dirname, '..', 'public', 'marketing')
fs.mkdirSync(OUT, { recursive: true })

const PALETTE = 'warm gold (#C0A269), espresso brown (#23201B), porcelain cream (#FAFAF9) and emerald (#10B981) accents'

// hero = photoreal wide crop; spot = illustrated square
const HEROES = [
  ['hero-home', `Wide cinematic photograph of a modern small retail shop in Bhutan, a friendly Bhutanese shopkeeper using a sleek tablet point-of-sale terminal on the counter, traditional Bhutanese wooden architecture details in the background, warm natural light, ${PALETTE} colour grade, premium, realistic`],
  ['hero-pos', `Photograph, close up of a retail checkout counter, a small 4K camera above the counter scanning grocery products, a cashier's hands, a modern dark screen showing product detection boxes, warm gold accent lighting, ${PALETTE}, realistic`],
  ['hero-marketplace', `Photograph of a young Bhutanese customer smiling while shopping on a smartphone, browsing an online store of local products, cosy home setting, warm tones, ${PALETTE} colour grade, realistic`],
  ['hero-sell', `Photograph of a proud Bhutanese shop owner standing in their well-stocked retail store holding a tablet, warm inviting light, confident, ${PALETTE} colour grade, realistic`],
  ['hero-about', `Photograph of a scenic Bhutanese town street with traditional dzong architecture and a small market, prayer flags, soft golden morning light, ${PALETTE} colour grade, warm, realistic`],
  ['hero-supplychain', `Photograph of a clean distribution warehouse with neatly stacked goods and a delivery van at the dock, a worker with a clipboard, warm light, ${PALETTE} colour grade, realistic`],
]
const SPOTS = [
  ['spot-ai-vision', `Modern flat 3D illustration of an AI camera detecting grocery products with glowing bounding boxes and check marks, ${PALETTE}, cream background, clean, minimal, centered`],
  ['spot-offline', `Modern flat 3D illustration of an offline-first point-of-sale device working without internet and then syncing to a cloud with sync arrows, ${PALETTE}, cream background, clean, minimal, centered`],
  ['spot-gst', `Modern flat 3D illustration of a tax invoice document with a bold 5% GST badge and a check mark, small chart and report icons, ${PALETTE}, cream background, clean, minimal, centered`],
  ['spot-receipts', `Modern flat 3D illustration of a digital receipt being sent to a smartphone via a chat bubble and an email envelope, ${PALETTE}, cream background, clean, minimal, centered`],
  ['spot-hardware', `Modern flat 3D illustration of a retail hardware set: a barcode scanner, a thermal receipt printer and a cash drawer, ${PALETTE}, cream background, clean, minimal, centered`],
  ['spot-supplychain', `Modern flat 3D illustration of a three tier supply chain flow, three connected boxes labelled by icons for distributor, wholesaler and retailer with arrows between them, ${PALETTE}, cream background, clean, minimal, centered`],
]

const NEG = ', no text, no words, no letters, no watermark, no logo'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Fetch the temporary image URL and return decodable bytes, or null if it isn't an image
// yet (z.ai's CDN sometimes serves an error/placeholder for a moment after generation).
async function fetchImageBytes(url) {
  const r = await fetch(url)
  if (!r.ok) return null
  const ct = r.headers.get('content-type') || ''
  const buf = Buffer.from(await r.arrayBuffer())
  // Guard against HTML/JSON error bodies masquerading as a 200.
  if (!ct.startsWith('image/') && buf.length < 1024) return null
  return buf
}

async function genOnce(key, prompt, kind, file) {
  const res = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: prompt + NEG }),
  })
  if (!res.ok) throw new Error(`z.ai ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`)
  const url = (await res.json())?.data?.[0]?.url
  if (!url) throw new Error('no image url returned')

  // The CDN object can lag the API response; retry the download a few times.
  let bytes = null
  for (let i = 0; i < 5 && !bytes; i++) {
    if (i) await sleep(1500)
    bytes = await fetchImageBytes(url)
  }
  if (!bytes) throw new Error('generated url never returned an image')

  const img = sharp(bytes)   // throws on non-image → caught by caller for a full retry
  const shaped = kind === 'hero'
    ? img.resize(1600, 1000, { fit: 'cover', position: 'attention' })
    : img.resize(1000, 1000, { fit: 'cover', position: 'attention' })
  await shaped.webp({ quality: 82 }).toFile(file)
}

async function genOne(key, prompt, kind) {
  const file = path.join(OUT, `${key}.webp`)
  if (!process.env.FORCE && fs.existsSync(file)) { console.log(`skip  ${key} (exists)`); return }
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await genOnce(key, prompt, kind, file)
      const kb = Math.round(fs.statSync(file).size / 1024)
      console.log(`ok    ${key}  (${kb} KB)${attempt > 1 ? ` [attempt ${attempt}]` : ''}`)
      return
    } catch (e) {
      lastErr = e
      await sleep(2000 * attempt)
    }
  }
  throw new Error(`${key}: ${lastErr?.message || 'failed'}`)
}

async function run() {
  const jobs = [
    ...HEROES.map(([k, p]) => ['hero', k, p]),
    ...SPOTS.map(([k, p]) => ['spot', k, p]),
  ]
  const CONC = 2
  let i = 0, fail = 0
  async function worker() {
    while (i < jobs.length) {
      const [kind, k, p] = jobs[i++]
      try { await genOne(k, p, kind) } catch (e) { fail++; console.error('FAIL ', e.message) }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  console.log(`\ndone — ${jobs.length - fail}/${jobs.length} images in public/marketing/`)
  if (fail) process.exit(2)
}
run()
