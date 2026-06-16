import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function requireAdmin() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (ctx.role !== 'SUPER_ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ctx }
}

/** PATCH — update / publish a release. */
export async function PATCH(request, { params }) {
  const { ctx, error } = await requireAdmin()
  if (error) return error
  const { id } = await params
  const body = await request.json()

  const patch = {}
  for (const f of ['version', 'channel', 'platform', 'notes', 'download_url', 'file_name', 'file_size', 'sha256', 'mandatory']) {
    if (body[f] !== undefined) patch[f] = body[f]
  }
  if (body.is_published !== undefined) {
    patch.is_published = !!body.is_published
    patch.published_at = body.is_published ? new Date().toISOString() : null
  }

  const { error: e } = await ctx.supabase.from('desktop_releases').update(patch).eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/** DELETE — remove a release record. */
export async function DELETE(request, { params }) {
  const { ctx, error } = await requireAdmin()
  if (error) return error
  const { id } = await params
  const { error: e } = await ctx.supabase.from('desktop_releases').delete().eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
