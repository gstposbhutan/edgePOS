import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// PATCH — toggle active status or reset PIN
export async function PATCH(request, { params }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const supabase = ctx.supabase

    const updates = {}
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (typeof body.is_available === 'boolean') updates.is_available = body.is_available

    const { data: rider, error } = await supabase
      .from('riders')
      .update(updates)
      .eq('id', id)
      .eq('entity_id', ctx.entityId)
      .select('id, name, is_active, is_available')
      .single()

    if (error) throw error
    return NextResponse.json({ rider })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
