import { NextResponse } from 'next/server'
import { getAuthContext, createServiceClient } from '@/lib/supabase/server'

// POST /api/auth/customer-phone — set the signed-in customer's phone (mandatory for customers).
// A customer's entity id === their auth id, so this only ever writes their own record.
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone } = await request.json()
  const clean = (phone || '').replace(/\s/g, '')
  if (!/^\+?[0-9]{8,15}$/.test(clean)) {
    return NextResponse.json({ error: 'A valid phone number is required (e.g. +97517123456)' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { error } = await svc.from('entities').update({ whatsapp_no: clean }).eq('id', ctx.entityId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Cart/checkout read the phone from the auth user's metadata, so mirror it there.
  const { data: prof } = await svc.from('user_profiles').select('id').eq('entity_id', ctx.entityId).limit(1).maybeSingle()
  const authId = prof?.id || ctx.userId
  if (authId) {
    const { data: cur } = await svc.auth.admin.getUserById(authId)
    await svc.auth.admin.updateUserById(authId, {
      user_metadata: { ...(cur?.user?.user_metadata || {}), phone: clean, phone_verified: true },
    })
  }
  return NextResponse.json({ success: true })
}
