// Shared supply-link resolution for the vendor consoles (distributor/wholesaler parity, Phase 0).
//
// A "supply link" is a real commercial relationship in one of the two B2B junctions:
//   distributor_wholesalers  — a DISTRIBUTOR sells to a WHOLESALER
//   retailer_wholesalers     — a WHOLESALER sells to a RETAILER
// seller = creditor (upstream); buyer = debtor (downstream). v1 links are whole-catalog (category NULL).
//
// Not every pair is linkable: a distributor↔retailer relationship has no junction (a distributor
// reaches retailers only through wholesalers), so those rows are favourite-only.

// khata_accounts.party_type for an entity debtor, matching the per-tier debit triggers
// (106_khata_debit_per_tier.sql): a WHOLESALER buyer gets a WHOLESALER-typed account, every other
// entity buyer falls under the RETAILER catch-all. Keep in lockstep with those triggers.
export function entityPartyType(buyerRole) {
  return buyerRole === 'WHOLESALER' ? 'WHOLESALER' : 'RETAILER'
}

/**
 * Resolve the junction + who-sells-to-whom for a (caller, target) pair.
 * seller = creditor (upstream); buyer = debtor (downstream). Returns null for an unsupported pair.
 */
export function resolveLink(callerRole, callerId, targetRole, targetId) {
  const pair = new Set([callerRole, targetRole])
  if (pair.has('DISTRIBUTOR') && pair.has('WHOLESALER')) {
    const distributor_id = callerRole === 'DISTRIBUTOR' ? callerId : targetId
    const wholesaler_id = callerRole === 'WHOLESALER' ? callerId : targetId
    return { table: 'distributor_wholesalers', key: { distributor_id, wholesaler_id }, seller: distributor_id, buyer: wholesaler_id }
  }
  if (pair.has('WHOLESALER') && pair.has('RETAILER')) {
    const wholesaler_id = callerRole === 'WHOLESALER' ? callerId : targetId
    const retailer_id = callerRole === 'RETAILER' ? callerId : targetId
    return { table: 'retailer_wholesalers', key: { retailer_id, wholesaler_id }, seller: wholesaler_id, buyer: retailer_id }
  }
  return null
}

/**
 * Ensure a B2B sell-side khata account exists for (creditor = seller, debtor = buyer) so a CREDIT
 * order between the tiers doesn't fail khata_debit_on_confirm's lookup. Idempotent — dedupes on the
 * (creditor, debtor) pair, so it never duplicates an existing account regardless of its party_type.
 * Credit starts disabled (limit 0); the seller raises it from their khata screen. Best-effort:
 * returns { id } or { error } and never throws.
 */
export async function ensureKhataAccount(supabase, { seller, buyer, createdBy }) {
  const { data: existing, error: findErr } = await supabase
    .from('khata_accounts')
    .select('id')
    .eq('creditor_entity_id', seller)
    .eq('debtor_entity_id', buyer)
    .maybeSingle()
  if (findErr) return { error: findErr.message }
  if (existing) return { id: existing.id }

  const { data: buyerEnt } = await supabase.from('entities').select('name, role').eq('id', buyer).maybeSingle()
  const { data, error } = await supabase
    .from('khata_accounts')
    .insert({
      creditor_entity_id: seller,
      debtor_entity_id: buyer,
      party_type: entityPartyType(buyerEnt?.role),
      debtor_name: buyerEnt?.name || 'B2B account',
      credit_limit: 0,
      status: 'ACTIVE',
      created_by: createdBy || null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}

/** Whether a (caller, target) role pair can form a supply link at all. */
export function linkablePair(callerRole, targetRole) {
  const pair = new Set([callerRole, targetRole])
  return (pair.has('DISTRIBUTOR') && pair.has('WHOLESALER')) || (pair.has('WHOLESALER') && pair.has('RETAILER'))
}

/**
 * For a caller browsing rows of `targetRole`, describe the junction columns used to look up which
 * rows are already actively linked. Returns null when the pair isn't linkable. `self` is the
 * caller's column, `other` is the row's column.
 */
export function linkLookup(callerRole, targetRole) {
  if (callerRole === 'DISTRIBUTOR' && targetRole === 'WHOLESALER') {
    return { table: 'distributor_wholesalers', self: 'distributor_id', other: 'wholesaler_id' }
  }
  if (callerRole === 'WHOLESALER' && targetRole === 'DISTRIBUTOR') {
    return { table: 'distributor_wholesalers', self: 'wholesaler_id', other: 'distributor_id' }
  }
  if (callerRole === 'WHOLESALER' && targetRole === 'RETAILER') {
    return { table: 'retailer_wholesalers', self: 'wholesaler_id', other: 'retailer_id' }
  }
  if (callerRole === 'RETAILER' && targetRole === 'WHOLESALER') {
    return { table: 'retailer_wholesalers', self: 'retailer_id', other: 'wholesaler_id' }
  }
  return null
}
