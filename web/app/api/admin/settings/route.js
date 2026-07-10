import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, userId, supabase, subRole } = ctx
  const { data: entity, error } = await supabase
    .from('entities')
    .select('id, name, whatsapp_no, tpn_gstin, shop_slug, marketplace_bio, marketplace_logo_url, delivery_mode, nqrc_enabled, nqrc_merchant_name, nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag')
    .eq('id', entityId)
    .single()

  if (error) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })

  // Email-notification opt-in is PER USER (the caller's own profile), not the shop.
  const { data: prof } = await supabase.from('user_profiles').select('email_notifications_enabled').eq('id', userId).maybeSingle()
  // subRole lets the form gate the OWNER-only payment-QR (NQRC) section.
  return NextResponse.json({ entity: { ...entity, email_notifications_enabled: !!prof?.email_notifications_enabled }, subRole })
}

export async function PATCH(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, userId, supabase, subRole } = ctx
  const body = await request.json()

  // Per-user: each user toggles their OWN email notifications.
  if (body.email_notifications_enabled !== undefined) {
    await supabase.from('user_profiles').update({ email_notifications_enabled: !!body.email_notifications_enabled }).eq('id', userId)
  }

  const allowed = {}
  if (body.name !== undefined) allowed.name = body.name.trim()
  if (body.whatsapp_no !== undefined) allowed.whatsapp_no = body.whatsapp_no.trim()
  if (body.tpn_gstin !== undefined) allowed.tpn_gstin = body.tpn_gstin?.trim() || null
  if (body.shop_slug !== undefined) allowed.shop_slug = body.shop_slug?.trim() || null
  if (body.marketplace_bio !== undefined) allowed.marketplace_bio = body.marketplace_bio?.trim() || null
  if (body.delivery_mode !== undefined && ['DELIVERY', 'PICKUP', 'NONE'].includes(body.delivery_mode)) {
    allowed.delivery_mode = body.delivery_mode
  }

  // Payment-QR (NQRC) merchant/bank details are OWNER-only — sensitive account data. Non-owners
  // sending these fields are silently ignored (the UI only shows the section to owners).
  if (subRole === 'OWNER') {
    if (body.nqrc_enabled !== undefined) allowed.nqrc_enabled = !!body.nqrc_enabled
    if (body.nqrc_merchant_name !== undefined) allowed.nqrc_merchant_name = body.nqrc_merchant_name?.trim() || null
    if (body.nqrc_merchant_city !== undefined) allowed.nqrc_merchant_city = body.nqrc_merchant_city?.trim() || null
    if (body.nqrc_account_id !== undefined) allowed.nqrc_account_id = body.nqrc_account_id?.trim() || null
    if (body.nqrc_psp_guid !== undefined) allowed.nqrc_psp_guid = body.nqrc_psp_guid?.trim() || null
    if (body.nqrc_mcc !== undefined) allowed.nqrc_mcc = body.nqrc_mcc?.trim() || null
    if (body.nqrc_account_tag !== undefined) allowed.nqrc_account_tag = body.nqrc_account_tag?.trim() || '26'
  }

  if (Object.keys(allowed).length > 0) {
    const { error } = await supabase.from('entities').update(allowed).eq('id', entityId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
