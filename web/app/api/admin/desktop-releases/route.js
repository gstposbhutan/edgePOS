import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function requireAdmin() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (ctx.role !== 'SUPER_ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ctx }
}

/** GET — list all releases (admin). */
export async function GET() {
  const { ctx, error } = await requireAdmin()
  if (error) return error
  const { data, error: e } = await ctx.supabase
    .from('desktop_releases')
    .select('*')
    .order('created_at', { ascending: false })
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ releases: data ?? [] })
}

/** POST — create a release. */
export async function POST(request) {
  const { ctx, error } = await requireAdmin()
  if (error) return error
  const body = await request.json()
  const version = body.version?.trim()
  if (!version) return NextResponse.json({ error: 'Version is required' }, { status: 400 })

  const insert = {
    version,
    channel:      body.channel || 'stable',
    platform:     body.platform || 'win',
    notes:        body.notes?.trim() || null,
    download_url: body.download_url?.trim() || null,
    mandatory:    !!body.mandatory,
    is_published: !!body.is_published,
    published_at: body.is_published ? new Date().toISOString() : null,
    created_by:   ctx.userId,
  }

  const { data, error: e } = await ctx.supabase
    .from('desktop_releases').insert(insert).select('*').single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ release: data }, { status: 201 })
}
