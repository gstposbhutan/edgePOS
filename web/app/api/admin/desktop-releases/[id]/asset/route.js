import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import { uploadReleaseAsset, isStorageConfigured } from '@/lib/storage/s3'

export const runtime = 'nodejs'

const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

/** POST — upload the installer for a release; stores to S3 and records url/size/sha256. */
export async function POST(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })

  const { id } = await params
  const { data: rel } = await ctx.supabase
    .from('desktop_releases').select('version').eq('id', id).single()
  if (!rel) return NextResponse.json({ error: 'Release not found' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB)` }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { url, size, sha256 } = await uploadReleaseAsset(buffer, rel.version, file.name)

  const { error: e } = await ctx.supabase
    .from('desktop_releases')
    .update({ download_url: url, file_name: file.name, file_size: size, sha256 })
    .eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })

  return NextResponse.json({ download_url: url, file_name: file.name, file_size: size, sha256 }, { status: 201 })
}
