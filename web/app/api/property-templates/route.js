import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GET /api/property-templates                         → all category-level templates, for the form.
// GET /api/property-templates?category=X[&subcategory=Y] → the resolved property list for a product:
//   the category-level ('') template MERGED with the (X,Y) subcategory template (subcategory wins
//   by key). Backward-compatible — passing only category returns the category-level template.
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const subcategory = url.searchParams.get('subcategory')

  if (category) {
    const { data, error } = await ctx.supabase
      .from('category_property_templates')
      .select('subcategory, properties')
      .eq('category', category)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const catLevel = (data || []).find(t => !t.subcategory)?.properties ?? []
    const subLevel = subcategory ? ((data || []).find(t => (t.subcategory || '') === subcategory)?.properties ?? []) : []
    const byKey = new Map()
    for (const p of catLevel) byKey.set(p.key, p)
    for (const p of subLevel) byKey.set(p.key, p)   // subcategory extends / overrides category-level
    return NextResponse.json({ properties: [...byKey.values()] })
  }

  // No category filter → the category-level templates only (form's all-list fallback).
  const { data, error } = await ctx.supabase
    .from('category_property_templates')
    .select('category, properties')
    .eq('subcategory', '')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const byCategory = Object.fromEntries((data ?? []).map(t => [t.category, t.properties]))
  return NextResponse.json({ templates: byCategory })
}
