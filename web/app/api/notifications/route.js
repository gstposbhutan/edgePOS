import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// GET  /api/notifications        → the caller's recent notifications + unread count (RLS-scoped).
// PATCH /api/notifications       → { id } marks one read; no id marks all read.
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await ctx.supabase
    .from('notifications')
    .select('id, type, title, body, link, read, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const unread = (data || []).filter(n => !n.read).length
  return NextResponse.json({ notifications: data || [], unread })
}

export async function PATCH(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await request.json().catch(() => ({}))
  let q = ctx.supabase.from('notifications').update({ read: true })
  q = id ? q.eq('id', id) : q.eq('read', false)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
