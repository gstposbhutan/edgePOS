import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

async function getEntityFromRequest(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')
  const supabase = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser(token)

  if (!user) return null

  const entityId = user.app_metadata?.entity_id
  if (!entityId) return null

  return { entityId, supabase }
}

export async function GET(request) {
  const ctx = await getEntityFromRequest(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const { data: entity, error } = await supabase
    .from('entities')
    .select('id, name, whatsapp_no, tpn_gstin, shop_slug, marketplace_bio, marketplace_logo_url')
    .eq('id', entityId)
    .single()

  if (error) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

  return NextResponse.json({ entity })
}

export async function PATCH(request) {
  const ctx = await getEntityFromRequest(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const body = await request.json()

  const allowed = {}
  if (body.name !== undefined) allowed.name = body.name.trim()
  if (body.whatsapp_no !== undefined) allowed.whatsapp_no = body.whatsapp_no.trim()
  if (body.tpn_gstin !== undefined) allowed.tpn_gstin = body.tpn_gstin?.trim() || null
  if (body.shop_slug !== undefined) allowed.shop_slug = body.shop_slug?.trim() || null
  if (body.marketplace_bio !== undefined) allowed.marketplace_bio = body.marketplace_bio?.trim() || null

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('entities')
    .update(allowed)
    .eq('id', entityId)
    .select('id, name, whatsapp_no, tpn_gstin, shop_slug, marketplace_bio')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entity: data })
}
