/**
 * @nexus-bhutan/sync-core — Register + Order + Movement + Khata reconciliation
 * ============================================================================
 * SHARED package: the canonical terminal→cloud reconciliation, consumed by the
 * web ingest route (web/app/api/sync/ingest) and the background sync-worker.
 *
 * Each desktop terminal runs its own embedded PocketBase with its OWN local ids.
 * The cloud (Supabase) has a separate id space. We reconcile them by stable
 * BUSINESS KEYS, never by raw ids:
 *
 *   cash_registers      →  (entity_id, machine_id)         [machine_id = MAC]
 *   orders              →  order_no                        [terminal-prefixed — P1-2]
 *   inventory_movements →  external_id                     ["<machineId>:<id>"]
 *   khata_transactions  →  external_id (via apply_synced_khata_txn RPC)
 *   products            →  matched by SKU (central brain; sku is globally unique)
 *
 * Takes rows already fetched from one terminal and writes them to Supabase.
 * Transport/auth (the terminal push → /api/sync/ingest) is a separate concern.
 *
 * PREREQUISITES (cloud migrations): 073 (cash_registers.machine_id), 074 (orders
 * trigger-safety + origin), 075 (khata external_id + apply_synced_khata_txn), 076
 * (inventory_movements.external_id), 077 (terminal_tokens). The terminal must know
 * its entity_id (P1-5) — the ingest resolves it from the terminal token.
 *
 * TRIGGER SAFETY (Migration 074): synced orders are tagged origin='TERMINAL_SYNC'
 * (set in syncOrders), so the cloud confirm triggers skip them — no double stock
 * deduction / khata re-debit. Cloud stock reconciles from the synced movements;
 * cloud khata balance from the synced khata_transactions (apply_synced_khata_txn).
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Canonical order digital signature (P1-3): sha256 hex of `${orderNo}:${grandTotal}:${tpn}`
 * — NO timestamp, so it recomputes identically on the terminal (SubtleCrypto), the web
 * order route, and here on ingest. `grandTotal` is interpolated as a raw JS number on
 * every side (e.g. 123.4 → "123.4"), so it must NOT be reformatted (no toFixed).
 */
export function computeOrderSignature(orderNo: string, grandTotal: number, tpn: string): string {
  return createHash('sha256').update(`${orderNo}:${grandTotal}:${tpn}`).digest('hex')
}

/** A cash_registers row as stored on a terminal's PocketBase. */
export interface TerminalRegister {
  id: string                     // local PocketBase id (used only to build the map)
  machine_id: string             // stable MAC-derived key
  name: string
  default_opening_float?: number
  is_active?: boolean
}

/** An order row as stored on a terminal's PocketBase. */
export interface TerminalOrder {
  id: string                     // local id (ignored cloud-side)
  order_no: string               // idempotency key (terminal-prefixed)
  register_id?: string | null    // LOCAL register id → remapped to cloud id
  order_type?: string
  status?: string
  is_quotation?: boolean
  items?: unknown
  subtotal?: number
  gst_total?: number
  grand_total?: number
  payment_method?: string
  payment_channel?: string | null
  payment_ref?: string | null
  digital_signature?: string | null
  created?: string               // terminal timestamp
}

/** One line inside a TerminalOrder.items JSONB snapshot. */
export interface TerminalOrderItemLine {
  id?: string                    // local line id
  product?: string | null        // LOCAL product id → remapped to cloud via the SKU map
  name?: string
  sku?: string | null
  quantity?: number
  unit_price?: number
  discount?: number
  gst_5?: number
  total?: number
}

/** A khata account row as stored on a terminal's PocketBase. */
export interface TerminalKhataAccount {
  id: string                     // local id → mapped to a cloud account
  debtor_name: string
  debtor_phone?: string | null
  credit_limit?: number          // NOT pushed — the cloud is authoritative for limits
}

/** A khata ledger entry as stored on a terminal's PocketBase. */
export interface TerminalKhataTxn {
  id: string                     // local id → external_id (idempotency key)
  khata_account: string          // LOCAL account id → remapped to cloud
  transaction_type: 'DEBIT' | 'CREDIT'
  amount: number
  reference_id?: string | null   // local order id (remap to cloud order id — TODO)
  notes?: string | null
}

/** A product row as stored on a terminal's PocketBase (only what's needed to map). */
export interface TerminalProduct {
  id: string                     // local id → mapped to a cloud product
  sku: string                    // business key — products match across systems by SKU
}

/** An inventory_movements row as stored on a terminal's PocketBase. */
export interface TerminalMovement {
  id: string                     // local id → external_id (idempotency key)
  product: string                // LOCAL product id → remapped to cloud via SKU
  movement_type: string          // SALE | RESTOCK | TRANSFER | LOSS | DAMAGED | RETURN
  quantity: number               // signed (SALE negative, RETURN positive)
  reference_id?: string | null   // local order id → remapped to cloud order id
  notes?: string | null
}

/** One terminal's unsynced batch, plus the store it belongs to. */
export interface TerminalBatch {
  entityId: string               // the cloud store id (the ingest sets this from the terminal token)
  actorId?: string | null        // token issuer (terminal_tokens.created_by) — preferred khata actor
  machineId: string              // this terminal's MAC — prefixes external_ids
  registers: TerminalRegister[]
  orders: TerminalOrder[]
  products: TerminalProduct[]    // to build the local→cloud product map (by SKU)
  movements: TerminalMovement[]
  khataAccounts: TerminalKhataAccount[]
  khataTxns: TerminalKhataTxn[]
  // TODO: order_items, shifts, cash_adjustments
}

type CloudRegisterRow = { id: string; machine_id: string | null }

/**
 * Upsert a terminal's registers, matched by (entity_id, machine_id), and return
 * a map of LOCAL register id → CLOUD register id for order remapping.
 * Relies on the UNIQUE(entity_id, machine_id) index from Migration 073.
 */
export async function syncRegisters(
  supabase: SupabaseClient,
  entityId: string,
  registers: TerminalRegister[]
): Promise<Map<string, string>> {
  const localToCloud = new Map<string, string>()
  if (registers.length === 0) return localToCloud

  const rows = registers.map((r) => ({
    entity_id: entityId,
    machine_id: r.machine_id,
    name: r.name,
    default_opening_float: r.default_opening_float ?? 0,
    is_active: r.is_active ?? true,
  }))

  const { data, error } = await supabase
    .from('cash_registers')
    .upsert(rows, { onConflict: 'entity_id,machine_id' })
    .select('id, machine_id')
  if (error) throw new Error(`register upsert failed: ${error.message}`)

  const byMachine = new Map<string, string>(
    ((data ?? []) as CloudRegisterRow[])
      .filter((d): d is { id: string; machine_id: string } => d.machine_id != null)
      .map((d) => [d.machine_id, d.id])
  )
  for (const r of registers) {
    const cloudId = byMachine.get(r.machine_id)
    if (cloudId) localToCloud.set(r.id, cloudId)
  }
  return localToCloud
}

/**
 * Upsert a terminal's orders, matched by order_no (idempotent), remapping each
 * order's LOCAL register_id → CLOUD id and stamping seller_id.
 * Synced orders are tagged origin='TERMINAL_SYNC' so the cloud confirm triggers skip them.
 */
export async function syncOrders(
  supabase: SupabaseClient,
  entityId: string,
  orders: TerminalOrder[],
  registerIdMap: Map<string, string>,
  sellerTpn: string | null = null
): Promise<{ upserted: number; unmappedRegisters: number; orderIdMap: Map<string, string>; rejected: string[]; unverified: number }> {
  if (orders.length === 0) return { upserted: 0, unmappedRegisters: 0, orderIdMap: new Map(), rejected: [], unverified: 0 }

  let unmappedRegisters = 0
  let unverified = 0
  const rejected: string[] = []          // order_nos whose signature didn't verify — NOT upserted
  const rows: Array<Record<string, unknown>> = []
  for (const o of orders) {
    // P1-3: verify the terminal's signature before trusting the row. Payload is
    // `${order_no}:${grand_total}:${seller_tpn}` (no timestamp), recomputable here.
    // Reject (skip) a present-but-wrong signature; pass through (count) when we can't
    // verify — the row has no signature, or the entity has no TPN on file.
    if (o.digital_signature && sellerTpn && o.grand_total != null) {
      if (computeOrderSignature(o.order_no, o.grand_total, sellerTpn) !== o.digital_signature) {
        rejected.push(o.order_no)
        continue
      }
    } else {
      unverified++
    }
    const cloudRegister = o.register_id ? registerIdMap.get(o.register_id) ?? null : null
    if (o.register_id && !cloudRegister) unmappedRegisters++
    rows.push({
      order_no: o.order_no,                 // conflict key
      seller_id: entityId,
      register_id: cloudRegister,
      origin: 'TERMINAL_SYNC',              // gates the cloud confirm triggers (Migration 074)
      order_type: o.order_type ?? 'POS_SALE',
      status: o.status ?? 'CONFIRMED',
      is_quotation: o.is_quotation ?? false,
      items: o.items ?? [],
      subtotal: o.subtotal ?? 0,
      gst_total: o.gst_total ?? 0,
      grand_total: o.grand_total ?? 0,
      payment_method: o.payment_method,
      payment_channel: o.payment_channel ?? null,
      payment_ref: o.payment_ref ?? null,
      digital_signature: o.digital_signature ?? null,
    })
  }

  if (rows.length === 0) return { upserted: 0, unmappedRegisters, orderIdMap: new Map(), rejected, unverified }

  const { data: upsertedRows, error } = await supabase
    .from('orders')
    .upsert(rows, { onConflict: 'order_no' })
    .select('id, order_no')
  if (error) throw new Error(`order upsert failed: ${error.message}`)

  // local order id → cloud order id, for remapping movement/khata reference_id.
  const byOrderNo = new Map<string, string>(
    ((upsertedRows ?? []) as { id: string; order_no: string }[]).map((r) => [r.order_no, r.id])
  )
  const orderIdMap = new Map<string, string>()
  for (const o of orders) {
    const cloudId = byOrderNo.get(o.order_no)
    if (cloudId) orderIdMap.set(o.id, cloudId)
  }

  return { upserted: rows.length, unmappedRegisters, orderIdMap, rejected, unverified }
}

/**
 * Expand each synced order's items JSONB into normalized order_items so the cloud has
 * line-item granularity for terminal sales too (refunds/replacements/reporting).
 * Idempotent on external_id (= "<machineId>:<order_no>:<lineIndex>") — a re-sync inserts
 * nothing. order_items has no confirm-time stock trigger, so inserting ACTIVE lines has
 * NO stock side effect; cloud stock stays driven by the synced movements (Migration 076).
 * Only orders that were actually applied (present in orderIdMap) get items.
 */
export async function syncOrderItems(
  supabase: SupabaseClient,
  machineId: string,
  orders: TerminalOrder[],
  orderIdMap: Map<string, string>,    // local order id → cloud order id
  productMap: Map<string, string>     // local product id → cloud product id (by SKU)
): Promise<{ posted: number; inserted: number }> {
  const rows: Array<Record<string, unknown>> = []
  for (const o of orders) {
    const cloudOrderId = orderIdMap.get(o.id)
    if (!cloudOrderId) continue                   // order not applied (rejected / unmapped)
    const lines = Array.isArray(o.items) ? (o.items as TerminalOrderItemLine[]) : []
    lines.forEach((line, idx) => {
      rows.push({
        order_id: cloudOrderId,
        product_id: line.product ? productMap.get(line.product) ?? null : null,
        sku: line.sku ?? null,
        name: line.name ?? 'Item',
        quantity: line.quantity ?? 0,
        unit_price: line.unit_price ?? 0,
        discount: line.discount ?? 0,
        gst_5: line.gst_5 ?? 0,
        total: line.total ?? 0,
        external_id: `${machineId}:${o.order_no}:${idx}`,
      })
    })
  }
  let inserted = 0
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('order_items')
      .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`order_items upsert failed: ${error.message}`)
    inserted = data?.length ?? 0
  }
  return { posted: rows.length, inserted }
}

/**
 * Build a LOCAL product id → CLOUD product id map by SKU (products are the shared
 * "central brain"; web products.sku is globally unique). Products with no SKU, or a
 * SKU absent from the cloud, are left unmapped — their movements are skipped.
 */
export async function buildProductMap(
  supabase: SupabaseClient,
  products: TerminalProduct[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const skus = products.map((p) => p.sku).filter(Boolean)
  if (skus.length === 0) return map
  const { data, error } = await supabase.from('products').select('id, sku').in('sku', skus)
  if (error) throw new Error(`product lookup failed: ${error.message}`)
  const bySku = new Map<string, string>(
    ((data ?? []) as { id: string; sku: string }[]).map((r) => [r.sku, r.id])
  )
  for (const p of products) {
    const cloudId = bySku.get(p.sku)
    if (cloudId) map.set(p.id, cloudId)
  }
  return map
}

/**
 * Sync a terminal's inventory movements. Cloud stock is reconciled by the EXISTING
 * apply_inventory_movement trigger (AFTER INSERT → products.current_stock += quantity);
 * we just insert each movement once. external_id (= "<machineId>:<movementId>") with
 * ON CONFLICT DO NOTHING makes it idempotent — a re-sync inserts nothing, so the
 * trigger never double-applies. product_id is remapped via the SKU product map;
 * reference_id is remapped to the cloud order id when known.
 */
export async function syncInventoryMovements(
  supabase: SupabaseClient,
  entityId: string,
  machineId: string,
  productMap: Map<string, string>,
  orderIdMap: Map<string, string>,
  movements: TerminalMovement[]
): Promise<{ posted: number; inserted: number; duplicate: number; unmappedProducts: number }> {
  let unmappedProducts = 0
  const rows: Array<{
    product_id: string; entity_id: string; movement_type: string; quantity: number;
    reference_id: string | null; notes: string | null; external_id: string
  }> = []
  for (const m of movements) {
    const cloudProduct = productMap.get(m.product)
    if (!cloudProduct) { unmappedProducts++; continue } // product_id is a FK — can't post without it
    rows.push({
      product_id: cloudProduct,
      entity_id: entityId,
      movement_type: m.movement_type,
      quantity: m.quantity,
      reference_id: m.reference_id ? orderIdMap.get(m.reference_id) ?? null : null,
      notes: m.notes ?? null,
      external_id: `${machineId}:${m.id}`,
    })
  }
  let inserted = 0
  if (rows.length > 0) {
    // ignoreDuplicates → ON CONFLICT (external_id) DO NOTHING: only NEW rows insert,
    // and only NEW inserts fire apply_inventory_movement (no double stock application).
    // .select() returns ONLY the inserted rows (conflicts produce none) → exact breakdown.
    const { data, error } = await supabase
      .from('inventory_movements')
      .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`movement upsert failed: ${error.message}`)
    inserted = data?.length ?? 0
  }
  return { posted: rows.length, inserted, duplicate: rows.length - inserted, unmappedProducts }
}

/**
 * Reconcile a terminal's khata ledger. Matches each terminal account to a cloud
 * account by business key (creditor_entity_id + debtor_phone + CONSUMER), creating
 * it if absent — WITHOUT clobbering the cloud's credit_limit (the cloud owns limits).
 * Then replays each terminal txn's DELTA exactly once via apply_synced_khata_txn
 * (idempotent on external_id = "<machineId>:<txnId>"), so balances reconcile without
 * double-counting and re-syncs are safe.
 */
export async function syncKhata(
  supabase: SupabaseClient,
  entityId: string,
  machineId: string,
  accounts: TerminalKhataAccount[],
  txns: TerminalKhataTxn[],
  orderIdMap: Map<string, string>,   // local order id → cloud order id (from syncOrders)
  actorId: string | null = null      // token issuer; preferred created_by for synced txns
): Promise<{ applied: number; duplicate: number; unmapped: number }> {
  // 1. Match/create cloud accounts → local→cloud account-id map.
  const localToCloud = new Map<string, string>()
  for (const a of accounts) {
    // Match by phone when present; otherwise fall back to (null phone + name) so a
    // phoneless walk-in account still reconciles instead of spawning duplicates.
    const phone = (a.debtor_phone ?? '').trim()
    const base = supabase
      .from('khata_accounts')
      .select('id')
      .eq('creditor_entity_id', entityId)
      .eq('party_type', 'CONSUMER')
    const { data: existing } = await (
      phone
        ? base.eq('debtor_phone', phone)
        : base.is('debtor_phone', null).eq('debtor_name', a.debtor_name)
    )
      .limit(1)
      .maybeSingle()

    let cloudId: string | null = existing?.id ?? null
    if (!cloudId) {
      const { data: created, error } = await supabase
        .from('khata_accounts')
        .insert({
          creditor_entity_id: entityId,
          party_type: 'CONSUMER',
          debtor_name: a.debtor_name,
          debtor_phone: a.debtor_phone ?? null,
          status: 'ACTIVE',
          outstanding_balance: 0, // built up by the replayed txns; cloud sets credit_limit
        })
        .select('id')
        .single()
      if (error) throw new Error(`khata account create failed: ${error.message}`)
      cloudId = created.id as string
    }
    localToCloud.set(a.id, cloudId)
  }

  // 2. Replay each txn's delta exactly once (idempotent on external_id).
  let applied = 0
  let duplicate = 0
  let unmapped = 0
  for (const t of txns) {
    const cloudAccount = localToCloud.get(t.khata_account)
    if (!cloudAccount) { unmapped++; continue }
    const cloudOrderId = t.reference_id ? orderIdMap.get(t.reference_id) ?? null : null
    const { data: result, error } = await supabase.rpc('apply_synced_khata_txn', {
      p_account_id: cloudAccount,
      p_external_id: `${machineId}:${t.id}`,
      p_type: t.transaction_type,
      p_amount: t.amount,
      p_order_id: cloudOrderId, // remapped from the terminal's local order id
      p_notes: t.notes ?? null,
      p_created_by: actorId, // token issuer; the RPC falls back to the entity owner when null
    })
    if (error) throw new Error(`khata txn apply failed: ${error.message}`)
    if (result === 'applied') applied++
    else duplicate++
  }
  return { applied, duplicate, unmapped }
}

/** Orchestrate one terminal's batch: registers FIRST (build the id map), then orders, then movements, then khata. */
export async function syncTerminalBatch(supabase: SupabaseClient, batch: TerminalBatch) {
  // Seller TPN — the third input to the P1-3 order signature, verified in syncOrders.
  const { data: ent } = await supabase
    .from('entities').select('tpn_gstin').eq('id', batch.entityId).maybeSingle()
  const sellerTpn = (ent as { tpn_gstin?: string } | null)?.tpn_gstin ?? null

  const registerIdMap = await syncRegisters(supabase, batch.entityId, batch.registers)
  const orderResult = await syncOrders(supabase, batch.entityId, batch.orders, registerIdMap, sellerTpn)
  const productMap = await buildProductMap(supabase, batch.products)
  const itemsResult = await syncOrderItems(supabase, batch.machineId, batch.orders, orderResult.orderIdMap, productMap)
  const movementResult = await syncInventoryMovements(
    supabase, batch.entityId, batch.machineId, productMap, orderResult.orderIdMap, batch.movements
  )
  const khataResult = await syncKhata(supabase, batch.entityId, batch.machineId, batch.khataAccounts, batch.khataTxns, orderResult.orderIdMap, batch.actorId ?? null)
  return {
    registers: registerIdMap.size,
    orders: orderResult.upserted,
    ordersRejected: orderResult.rejected,        // bad-signature order_nos (NOT applied)
    ordersUnverified: orderResult.unverified,    // no signature / no entity TPN — passed through
    unmappedRegisters: orderResult.unmappedRegisters,
    orderItems: itemsResult.posted,
    orderItemsInserted: itemsResult.inserted,
    movements: movementResult.posted,
    movementsInserted: movementResult.inserted,
    movementsDuplicate: movementResult.duplicate,
    unmappedProducts: movementResult.unmappedProducts,
    khataApplied: khataResult.applied,
    khataDuplicate: khataResult.duplicate,
    khataUnmapped: khataResult.unmapped,
  }
}
