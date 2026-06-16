import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Public endpoint — used by the desktop app's update check and the web pages.
// Returns the highest published release for the given platform/channel.
export const runtime = 'nodejs'

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

export async function GET(request) {
  const supabase = createServiceClient()
  if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const channel  = searchParams.get('channel')  || 'stable'
  const platform = searchParams.get('platform') || 'win'
  const current  = searchParams.get('current')

  const { data, error } = await supabase
    .from('desktop_releases')
    .select('version, channel, platform, notes, download_url, file_name, file_size, sha256, mandatory, published_at')
    .eq('is_published', true)
    .eq('channel', channel)
    .eq('platform', platform)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ release: null, update_available: false })

  const latest = data.reduce((best, r) => (cmpVersion(r.version, best.version) > 0 ? r : best), data[0])
  const update_available = current ? cmpVersion(latest.version, current) > 0 : null

  return NextResponse.json({ release: latest, update_available })
}
