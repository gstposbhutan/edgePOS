import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { resolveLink, ensureKhataAccount } from '@/lib/console/supply-links'

// Supply-link management (Phase 0 F1). Turns the decorative "favourite" into a real commercial link
// in the `distributor_wholesalers` / `retailer_wholesalers` junctions, and (F2) auto-provisions the
// B2B khata account so credit orders between the tiers work. v1 links are whole-catalog (category
// NULL). Callers are the two vendor consoles; mutations require OWNER/MANAGER.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']
const MANAGER_ROLES = ['OWNER', 'MANAGER', 'ADMIN']

/** GET /api/console/links — this caller's active whole-catalog supply links (both directions). */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { entityId, role, supabase } = ctx

    const rows = [] // { id, entity_id, direction }
    if (role === 'DISTRIBUTOR') {
      const { data } = await supabase.from('distributor_wholesalers')
        .select('id, wholesaler_id').eq('distributor_id', entityId).eq('active', true).is('category_id', null)
      for (const r of data ?? []) rows.push({ id: r.id, entity_id: r.wholesaler_id, direction: 'downstream' })
    } else { // WHOLESALER
      const [dw, rw] = await Promise.all([
        supabase.from('distributor_wholesalers').select('id, distributor_id').eq('wholesaler_id', entityId).eq('active', true).is('category_id', null),
        supabase.from('retailer_wholesalers').select('id, retailer_id').eq('wholesaler_id', entityId).eq('active', true).is('category_id', null),
      ])
      for (const r of dw.data ?? []) rows.push({ id: r.id, entity_id: r.distributor_id, direction: 'upstream' })
      for (const r of rw.data ?? []) rows.push({ id: r.id, entity_id: r.retailer_id, direction: 'downstream' })
    }

    const ids = [...new Set(rows.map(r => r.entity_id))]
    let byId = {}
    if (ids.length) {
      const { data: ents } = await supabase.from('entities').select('id, name, role').in('id', ids)
      byId = Object.fromEntries((ents ?? []).map(e => [e.id, e]))
    }
    const links = rows.map(r => ({ id: r.id, direction: r.direction, entity_id: r.entity_id, name: byId[r.entity_id]?.name ?? null, role: byId[r.entity_id]?.role ?? null }))
    return NextResponse.json({ links })
  } catch (err) {
    console.error('[console/links] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/links { target_entity_id } — create (or reactivate) a supply link + ensure the B2B khata account. */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!MANAGER_ROLES.includes(ctx.subRole)) return NextResponse.json({ error: 'Only a manager or owner can connect suppliers/buyers' }, { status: 403 })

    const { entityId, role, userId, supabase } = ctx
    const { target_entity_id } = await request.json().catch(() => ({}))
    if (!target_entity_id) return NextResponse.json({ error: 'target_entity_id is required' }, { status: 400 })
    if (target_entity_id === entityId) return NextResponse.json({ error: 'Cannot link to your own entity' }, { status: 400 })

    const { data: target } = await supabase.from('entities').select('id, name, role').eq('id', target_entity_id).maybeSingle()
    if (!target) return NextResponse.json({ error: 'Target entity not found' }, { status: 404 })

    const link = resolveLink(role, entityId, target.role, target.id)
    if (!link) return NextResponse.json({ error: `Cannot link a ${role} to a ${target.role}` }, { status: 400 })

    // Ensure the whole-catalog (category-less) link exists + is active.
    const existing = await supabase.from(link.table).select('id, active').match(link.key).is('category_id', null).maybeSingle()
    if (existing.data) {
      if (!existing.data.active) await supabase.from(link.table).update({ active: true }).eq('id', existing.data.id)
    } else {
      const { error } = await supabase.from(link.table).insert({ ...link.key, active: true })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // F2: ensure the B2B khata account (creditor = seller/upstream, debtor = buyer/downstream) so a
    // CREDIT order between the tiers doesn't fail the khata_debit_on_confirm lookup. Best-effort —
    // a link is still useful for cash/immediate orders even if the khata can't be provisioned.
    const khata = await ensureKhataAccount(supabase, { seller: link.seller, buyer: link.buyer, createdBy: userId })
    if (khata.error) console.error('[console/links] khata provisioning failed:', khata.error)

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[console/links] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/console/links?target_entity_id= — deactivate the supply link (khata account is kept). */
export async function DELETE(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!MANAGER_ROLES.includes(ctx.subRole)) return NextResponse.json({ error: 'Only a manager or owner can disconnect' }, { status: 403 })

    const { entityId, role, supabase } = ctx
    const targetId = new URL(request.url).searchParams.get('target_entity_id')
    if (!targetId) return NextResponse.json({ error: 'target_entity_id is required' }, { status: 400 })

    const { data: target } = await supabase.from('entities').select('id, role').eq('id', targetId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'Target entity not found' }, { status: 404 })
    const link = resolveLink(role, entityId, target.role, target.id)
    if (!link) return NextResponse.json({ error: 'No such link' }, { status: 400 })

    const { error } = await supabase.from(link.table).update({ active: false }).match(link.key).is('category_id', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[console/links] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
