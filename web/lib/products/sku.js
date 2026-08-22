// Auto-SKU numbering. When a product is created with a blank SKU we either continue the
// vendor's existing numbering series, or start a default one — always producing a value that
// is UNIQUE across all products (public.products has a global UNIQUE(sku) constraint).

// "ABC-007" -> { prefix: "ABC-", num: 7, width: 3 }; null if there's no trailing number.
export function parseSku(sku) {
  const m = String(sku || '').trim().match(/^(.*?)(\d+)$/)
  if (!m) return null
  return { prefix: m[1], num: parseInt(m[2], 10), width: m[2].length }
}

export function formatSku({ prefix, num, width }) {
  return `${prefix}${String(num).padStart(width, '0')}`
}

/**
 * From a vendor's existing SKUs, pick the dominant numeric series (most-used prefix, then
 * highest number) and return the next slot in it. null if none of the SKUs are a numeric series.
 * @returns {{prefix:string,num:number,width:number}|null}
 */
export function nextInVendorSeries(existingSkus) {
  const groups = new Map()   // prefix -> { count, maxNum, width }
  for (const s of existingSkus || []) {
    const p = parseSku(s)
    if (!p) continue
    const g = groups.get(p.prefix) || { count: 0, maxNum: -1, width: p.width }
    g.count += 1
    g.maxNum = Math.max(g.maxNum, p.num)
    g.width = Math.max(g.width, p.width)
    groups.set(p.prefix, g)
  }
  if (groups.size === 0) return null
  let best = null, bestPrefix = ''
  for (const [prefix, g] of groups) {
    if (!best || g.count > best.count || (g.count === best.count && g.maxNum > best.maxNum)) {
      best = g; bestPrefix = prefix
    }
  }
  return { prefix: bestPrefix, num: best.maxNum + 1, width: best.width }
}

// Abbreviation candidates for a shop name, shortest/most-natural first:
//   "Dawai Tshongkhang" -> ["DT", "DAT", "DAWT", "DAW", "DAWA", "DAWAI"]
//   "Dawai"             -> ["DA", "DAW", "DAWA", "DAWAI"]
// Used to pick a per-vendor SKU prefix that's unique across vendors.
export function abbrevCandidates(name) {
  const words = String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['SKU']
  const restInitials = words.slice(1).map(w => w[0]).join('')
  const raw = [
    words.map(w => w[0]).join(''),          // initials (DT)
    words[0].slice(0, 2) + restInitials,    // first-2 of word 1 + other initials (DAT)
    words[0].slice(0, 3) + restInitials,    // first-3 of word 1 + other initials (DAWT)
    words[0].slice(0, 3),                   // DAW
    words[0].slice(0, 4),                   // DAWA
    words[0].slice(0, 5),                   // DAWAI
  ]
  return [...new Set(raw.map(c => c.slice(0, 6)).filter(c => c && c.length >= 2))]
}

// Is the `PREFIX-` namespace already claimed by a *different* vendor?
async function prefixTakenByOther(svc, entityId, prefix) {
  const like = prefix.replace(/[%_\\]/g, '')
  const { data } = await svc
    .from('products').select('created_by')
    .ilike('sku', `${like}-%`)
    .neq('created_by', entityId)
    .limit(1)
  return !!(data && data.length)
}

// Choose a SKU prefix for a vendor with no series yet: the shortest name abbreviation not
// already used by another vendor; if every abbreviation collides, append a counter (DT2, DT3…).
async function pickVendorPrefix(svc, entityId, name) {
  const cands = abbrevCandidates(name)
  for (const c of cands) {
    if (!(await prefixTakenByOther(svc, entityId, c))) return c
  }
  const base = cands[0] || 'SKU'
  for (let k = 2; k < 1000; k++) {
    const c = `${base}${k}`
    if (!(await prefixTakenByOther(svc, entityId, c))) return c
  }
  return `${base}${String(entityId).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}`
}

/**
 * Compute the next unique SKU for a vendor.
 * - If the vendor already has a numbering series, continue it (next number, width preserved).
 * - Otherwise start one keyed to a per-vendor abbreviation of the shop name that's unique across
 *   vendors — e.g. "DT-001"; if "DT" is taken by another shop, "DAT-001", and so on.
 * products.sku is globally UNIQUE, so the final candidate is bumped past any taken value.
 *
 * @param svc      a SERVICE-role Supabase client (must see all products for the cross-vendor checks)
 * @param entityId the vendor (products.created_by)
 * @returns {Promise<string>}
 */
export async function nextUniqueSku(svc, entityId) {
  const { data: mine } = await svc
    .from('products').select('sku').eq('created_by', entityId).not('sku', 'is', null)
  const mySkus = (mine || []).map(r => r.sku).filter(Boolean)

  let series = nextInVendorSeries(mySkus)
  if (!series) {
    let name = ''
    try {
      const { data: ent } = await svc.from('entities').select('name').eq('id', entityId).maybeSingle()
      name = ent?.name || ''
    } catch { /* fall back to SKU */ }
    const prefix = await pickVendorPrefix(svc, entityId, name)
    series = { prefix: `${prefix}-`, num: 1, width: 3 }   // DT-001
  }

  // Enforce the global UNIQUE(sku): pull everything already taken under this prefix and bump past it.
  const likePrefix = series.prefix.replace(/[%_\\]/g, '')   // LIKE-safe literal
  const { data: taken } = await svc.from('products').select('sku').ilike('sku', `${likePrefix}%`)
  const takenSet = new Set((taken || []).map(r => String(r.sku || '').toLowerCase()))

  let guard = 0
  while (takenSet.has(formatSku(series).toLowerCase()) && guard < 100000) { series.num += 1; guard += 1 }
  return formatSku(series)
}
