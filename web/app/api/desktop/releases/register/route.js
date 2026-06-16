import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Machine-to-machine endpoint for CI to register a built release.
// Auth: shared secret in the `x-release-token` header == env RELEASE_INGEST_TOKEN.
// (CI has no user session, so this is separate from the SUPER_ADMIN admin routes.)
export const runtime = 'nodejs'

export async function POST(request) {
  const token = process.env.RELEASE_INGEST_TOKEN
  if (!token) return NextResponse.json({ error: 'Release ingest not configured' }, { status: 503 })
  if (request.headers.get('x-release-token') !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const version = body.version?.trim()
  if (!version) return NextResponse.json({ error: 'version is required' }, { status: 400 })

  const publish = body.publish !== false // default true for CI
  const row = {
    version,
    channel:      body.channel  || 'stable',
    platform:     body.platform || 'win',
    notes:        body.notes?.trim() || null,
    download_url: body.download_url?.trim() || null,
    file_name:    body.file_name || null,
    file_size:    body.file_size ?? null,
    sha256:       body.sha256 || null,
    mandatory:    !!body.mandatory,
    is_published: publish,
    published_at: publish ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('desktop_releases')
    .upsert(row, { onConflict: 'version,channel,platform' })
    .select('id, version, channel, platform, is_published')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ release: data }, { status: 201 })
}
