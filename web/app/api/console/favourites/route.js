import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { linkLookup } from '@/lib/console/supply-links'

// The caller's saved entities (their "Saved" list). Everything here is scoped to
// actor_entity_id = the signed-in entity, so one vendor never sees another's bookmarks.
// Only the two vendor consoles use favourites; other roles are rejected 403.
const VENDOR_ROLES = ['DISTRIBUTOR', 'WHOLESALER']

/** GET /api/console/favourites — this caller's favourites, joined to target entity details */
export async function GET() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx

    const { data, error } = await supabase
      .from('favourites')
      .select('id, created_at, target:entities!favourites_target_entity_id_fkey(id, name, role, address, whatsapp_no)')
      .eq('actor_entity_id', entityId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Flatten the joined target onto each row so the client gets a plain entity shape.
    const favourites = (data ?? [])
      .filter(f => f.target) // skip rows whose target was deleted out from under us
      .map(f => ({ favourite_id: f.id, created_at: f.created_at, ...f.target }))

    // Mark which saved rows are also active supply links. Favourites can be a mix of roles
    // (a distributor saves both wholesalers and retailers), and each linkable role maps to a
    // different junction — so group the ids by junction and look each group up once.
    const groups = new Map() // lk.table -> { lk, ids }
    for (const f of favourites) {
      const lk = linkLookup(ctx.role, f.role)
      f.linkable = !!lk
      f.is_linked = false
      if (lk) {
        const g = groups.get(lk.table) || { lk, ids: [] }
        g.ids.push(f.id)
        groups.set(lk.table, g)
      }
    }
    for (const { lk, ids } of groups.values()) {
      const { data: links } = await supabase
        .from(lk.table)
        .select(lk.other)
        .eq(lk.self, entityId).eq('active', true).is('category_id', null)
        .in(lk.other, ids)
      const linked = new Set((links ?? []).map(l => l[lk.other]))
      for (const f of favourites) if (f.linkable && linked.has(f.id)) f.is_linked = true
    }

    return NextResponse.json({ favourites })
  } catch (err) {
    console.error('[console/favourites] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST /api/console/favourites { target_entity_id } — save an entity (no-op if already saved) */
export async function POST(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { target_entity_id } = await request.json().catch(() => ({}))

    if (!target_entity_id) return NextResponse.json({ error: 'target_entity_id is required' }, { status: 400 })
    if (target_entity_id === entityId) return NextResponse.json({ error: 'Cannot favourite your own entity' }, { status: 400 })

    // The (actor, target) unique constraint makes a repeat favourite harmless — upsert with
    // ignoreDuplicates so a second tap just returns ok instead of erroring.
    const { error } = await supabase
      .from('favourites')
      .upsert(
        { actor_entity_id: entityId, target_entity_id },
        { onConflict: 'actor_entity_id,target_entity_id', ignoreDuplicates: true }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[console/favourites] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/console/favourites?target_entity_id= — remove this caller's favourite */
export async function DELETE(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!VENDOR_ROLES.includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { entityId, supabase } = ctx
    const { searchParams } = new URL(request.url)
    const targetEntityId = searchParams.get('target_entity_id')

    if (!targetEntityId) return NextResponse.json({ error: 'target_entity_id is required' }, { status: 400 })

    const { error } = await supabase
      .from('favourites')
      .delete()
      .eq('actor_entity_id', entityId)      // only ever the caller's own bookmark
      .eq('target_entity_id', targetEntityId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[console/favourites] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
