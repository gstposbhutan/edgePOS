import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/face-profiles?entity_id=...
 * Load active face profiles for a store.
 */
export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entity_id') ?? ctx.entityId

  const supabase = ctx.supabase
  const { data, error } = await supabase
    .from('face_profiles')
    .select('id, whatsapp_no, name, embedding')
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .not('embedding', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profiles: data ?? [] })
}

/**
 * POST /api/face-profiles
 * Enroll a new face profile. Requires consent token.
 *
 * Body: { entity_id, whatsapp_no, name, embedding, consent_token, consent_at }
 */
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { entity_id, whatsapp_no, name, embedding, consent_token, consent_at } = body

  if (!entity_id) return NextResponse.json({ error: 'entity_id is required' }, { status: 400 })
  if (!embedding) return NextResponse.json({ error: 'embedding is required' }, { status: 400 })
  if (!consent_token) return NextResponse.json({ error: 'consent_token is required — enrollment blocked without consent' }, { status: 403 })

  if (entity_id !== ctx.entityId) {
    return NextResponse.json({ error: 'Entity mismatch' }, { status: 403 })
  }

  const supabase = ctx.supabase
  const { data, error } = await supabase
    .from('face_profiles')
    .insert({
      entity_id,
      whatsapp_no: whatsapp_no ?? null,
      name: name ?? null,
      embedding,
      consent_at,
      consent_token,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profileId: data.id }, { status: 201 })
}
