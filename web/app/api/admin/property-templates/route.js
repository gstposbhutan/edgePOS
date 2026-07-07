import { NextResponse } from 'next/server'
import { getAuthContext, createServiceClient } from '@/lib/supabase/server'

// Platform-admin management of per-category custom-property templates.
// GET  → list all templates. PUT → upsert one { category, properties[] }. DELETE ?category= → remove.

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await ctx.supabase
    .from('category_property_templates')
    .select('id, category, properties, updated_at')
    .order('category')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function PUT(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const category = (body.category || '').trim()
  if (!category) return NextResponse.json({ error: 'Category is required' }, { status: 400 })

  // Normalise the property list.
  const properties = Array.isArray(body.properties) ? body.properties
    .map(p => ({
      key: String(p.key || '').trim().toLowerCase().replace(/\s+/g, '_'),
      label: String(p.label || p.key || '').trim(),
      type: ['text', 'number', 'select'].includes(p.type) ? p.type : 'text',
      ...(Array.isArray(p.options) && p.options.length ? { options: p.options.map(o => String(o).trim()).filter(Boolean) } : {}),
    }))
    .filter(p => p.key) : []

  const svc = createServiceClient()
  if (!svc) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  const { data, error } = await svc
    .from('category_property_templates')
    .upsert({ category, properties, updated_at: new Date().toISOString() }, { onConflict: 'category' })
    .select('id, category, properties, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })
  const category = new URL(request.url).searchParams.get('category')
  if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 })
  const svc = createServiceClient()
  const { error } = await svc.from('category_property_templates').delete().eq('category', category)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
