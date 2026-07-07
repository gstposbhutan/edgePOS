import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GET /api/property-templates            → all templates (category → properties), for the product form.
// GET /api/property-templates?category=X  → just that category's property list.
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const category = new URL(request.url).searchParams.get('category')
  let q = ctx.supabase.from('category_property_templates').select('category, properties')
  if (category) q = q.eq('category', category)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (category) return NextResponse.json({ properties: data?.[0]?.properties ?? [] })
  const byCategory = Object.fromEntries((data ?? []).map(t => [t.category, t.properties]))
  return NextResponse.json({ templates: byCategory })
}
