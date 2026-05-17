import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function PATCH(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
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
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
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
