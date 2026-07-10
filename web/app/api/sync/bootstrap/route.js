import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * Cloud → terminal BOOTSTRAP (cold-start provisioning) — the inverse of /api/sync/ingest.
 *
 * A freshly-activated terminal pulls its store's catalog + reference data into local
 * PocketBase on first launch. The cloud (Supabase) is the source of truth for products;
 * the terminal upserts what it receives by business key (SKU / category name / khata phone),
 * so this is safe to re-run.
 *
 * AUTH: the same per-terminal bearer token as the ingest. The store (entity_id) is resolved
 * FROM THE TOKEN — never from the request — so a terminal can only ever read its own store.
 *
 * FIELD BRIDGE: Supabase products.selling_price → PocketBase products.sale_price
 * (the per-unit/per-kg rate for sold_by_weight goods lives here). cost_price is PB-only and
 * left to its default; mrp/wholesale_price/unit/sold_by_weight carry across by the same name.
 */
export async function GET(request) {
  const authz = request.headers.get('authorization') || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : null
  if (!token) return NextResponse.json({ error: 'Missing terminal token' }, { status: 401 })

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Sync not configured' }, { status: 503 })

  // Validate by sha256(token) — entity resolved from the token, not the request.
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: cred, error: credError } = await supabase
    .from('terminal_tokens')
    .select('id, entity_id, register_id')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle()
  if (credError) return NextResponse.json({ error: 'Auth check failed' }, { status: 500 })
  if (!cred) return NextResponse.json({ error: 'Invalid or inactive terminal token' }, { status: 401 })

  const entityId = cred.entity_id

  // Store profile + this store's active catalog (+ category) + its khata accounts.
  const [entityRes, productsRes, categoriesRes, khataRes, storeUsersRes] = await Promise.all([
    supabase
      .from('entities')
      .select('id, name, role, tpn_gstin, whatsapp_no')
      .eq('id', entityId)
      .maybeSingle(),
    supabase
      .from('products')
      .select(`
        id, name, sku, barcode, qr_code, hsn_code, unit, mrp, selling_price,
        wholesale_price, current_stock, reorder_point, image_url, is_active, sold_by_weight,
        product_categories(categories(name))
      `)
      .eq('created_by', entityId)
      .eq('is_active', true)
      // Terminals are the retailer POS with no concept of Model-B sealed packages — never push
      // PACKAGE / package-only products, whose current_stock is a sealed-unit count the terminal
      // would mis-sell as a plain SKU.
      .eq('product_type', 'SINGLE')
      .eq('sold_as_package_only', false),
    supabase
      .from('categories')
      .select('id, name')
      .order('name'),
    supabase
      .from('khata_accounts')
      .select('debtor_name, debtor_phone, credit_limit, outstanding_balance, party_type, credit_term_days, status')
      .eq('creditor_entity_id', entityId),
    // Store team — email + bcrypt password hash (same-hash mirror to local PB) + role.
    supabase.rpc('get_terminal_store_users', { p_entity: entityId }),
  ])

  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 })

  // Shape products for PocketBase: selling_price → sale_price; first category name (PB
  // products.category is single-select). Nulls coalesced so the terminal can insert directly.
  const products = (productsRes.data ?? []).map((p) => ({
    sku: p.sku || '',
    name: p.name,
    barcode: p.barcode || '',
    qr_code: p.qr_code || '',
    hsn_code: p.hsn_code || '',
    unit: p.unit || 'pcs',
    mrp: p.mrp ?? 0,
    sale_price: p.selling_price ?? p.mrp ?? 0,
    wholesale_price: p.wholesale_price ?? 0,
    current_stock: p.current_stock ?? 0,
    reorder_point: p.reorder_point ?? 10,
    image_url: p.image_url || '',
    is_active: p.is_active ?? true,
    sold_by_weight: p.sold_by_weight ?? false,
    category_name: p.product_categories?.[0]?.categories?.name ?? null,
  }))

  // Liveness marker (best-effort).
  await supabase
    .from('terminal_tokens')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', cred.id)

  // This terminal's register + mode (POS vs BACK_OFFICE). Pushed down so a mode change made in
  // the web propagates to the terminal on the next bootstrap, without re-issuing the .lic.
  let register = null
  if (cred.register_id) {
    const { data: reg } = await supabase
      .from('cash_registers').select('id, name, mode').eq('id', cred.register_id).maybeSingle()
    if (reg) register = { id: reg.id, name: reg.name, mode: reg.mode || 'POS' }
  }

  return NextResponse.json({
    ok: true,
    entityId,
    entity: entityRes.data ?? null,
    register,
    categories: categoriesRes.data ?? [],
    products,
    khata: khataRes.data ?? [],
    // Team members to mirror into local PB auth (email, name, role, bcrypt hash).
    users: (storeUsersRes.data ?? []).map((u) => ({
      email: u.email,
      full_name: u.full_name || '',
      sub_role: u.sub_role,
      password_hash: u.password_hash,
    })),
    generatedAt: new Date().toISOString(),
  })
}
