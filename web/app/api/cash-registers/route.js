import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { data: registers, error } = await supabase
    .from('cash_registers')
    .select('id, name, default_opening_float, is_active, created_at')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ registers: registers || [] })
}

export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, subRole, userId, supabase } = ctx
  if (!['MANAGER', 'OWNER', 'ADMIN'].includes(subRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await request.json()

  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Register name is required' }, { status: 400 })

  const default_opening_float = parseFloat(body.default_opening_float) || 0
  if (default_opening_float < 0) return NextResponse.json({ error: 'Opening float must be >= 0' }, { status: 400 })

  const { data, error } = await supabase
    .from('cash_registers')
    .insert({
      entity_id: entityId,
      name,
      default_opening_float,
      is_active: true,
      created_by: userId,
    })
    .select('id, name, default_opening_float, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ register: data }, { status: 201 })
}
