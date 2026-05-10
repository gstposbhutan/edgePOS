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
  const subRole = user.app_metadata?.sub_role
  if (!entityId) return null
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) return null

  return { entityId, supabase }
}

export async function PATCH(request, { params }) {
  const ctx = await getEntityFromRequest(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const { id } = await params
  const body = await request.json()

  const updates = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.default_opening_float !== undefined) {
    updates.default_opening_float = parseFloat(body.default_opening_float)
    if (updates.default_opening_float < 0) return NextResponse.json({ error: 'Opening float must be >= 0' }, { status: 400 })
  }
  if (body.is_active !== undefined) updates.is_active = !!body.is_active

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('cash_registers')
    .update(updates)
    .eq('id', id)
    .eq('entity_id', entityId)
    .select('id, name, default_opening_float, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Register not found' }, { status: 404 })

  return NextResponse.json({ register: data })
}

export async function DELETE(request, { params }) {
  const ctx = await getEntityFromRequest(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const { id } = await params

  // Soft delete — deactivate instead of removing
  const { data, error } = await supabase
    .from('cash_registers')
    .update({ is_active: false })
    .eq('id', id)
    .eq('entity_id', entityId)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Register not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
