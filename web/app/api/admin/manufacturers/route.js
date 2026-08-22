import { NextResponse } from 'next/server'
import { getAuthContext, createServiceClient } from '@/lib/supabase/server'

// Platform-admin management of the SHARED manufacturer / brand list (brand lives on
// public.products, common to all vendors/wholesalers/distributors).
//   GET  → { manufacturers: [{ brand, count }] }  (distinct brands + product counts, global)
//   POST → merge/dedup: { from: string[], into: string } reassigns every product whose brand
//          is in `from` to `into`. SUPER_ADMIN only. Returns { updated, into }.

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const svc = createServiceClient()
  if (!svc) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { data, error } = await svc
    .from('products')
    .select('brand')
    .not('brand', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Count products per exact brand string (preserving each distinct casing as its own row —
  // that's what the admin needs to see in order to merge the variants).
  const counts = new Map()
  for (const r of data || []) {
    const b = (r.brand || '').trim()
    if (!b) continue
    counts.set(b, (counts.get(b) || 0) + 1)
  }
  const manufacturers = [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => a.brand.localeCompare(b.brand, undefined, { sensitivity: 'base' }))

  return NextResponse.json({ manufacturers })
}

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const into = (body.into || '').trim()
  const from = Array.isArray(body.from)
    ? [...new Set(body.from.map(s => (s || '').trim()).filter(Boolean))]
    : []

  if (!into) return NextResponse.json({ error: 'A canonical brand name (into) is required' }, { status: 400 })
  // Only reassign the *other* variants; leave rows already on the canonical name alone.
  const sources = from.filter(b => b !== into)
  if (sources.length === 0) return NextResponse.json({ error: 'Select at least one other brand to merge in' }, { status: 400 })

  const svc = createServiceClient()
  if (!svc) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { data, error } = await svc
    .from('products')
    .update({ brand: into })
    .in('brand', sources)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: data?.length ?? 0, into })
}
