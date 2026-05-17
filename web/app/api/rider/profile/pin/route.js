import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

export async function PATCH(request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { current_pin, new_pin } = await request.json()
    if (!current_pin || !new_pin || new_pin.length < 4) {
      return NextResponse.json({ error: 'Current PIN and new PIN (min 4 digits) are required' }, { status: 400 })
    }

    const { supabase, userId } = ctx

    const { data: rider } = await supabase
      .from('riders')
      .select('id, pin_hash')
      .eq('auth_user_id', userId)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const valid = await bcrypt.compare(String(current_pin), rider.pin_hash)
    if (!valid) return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 400 })

    const newHash = await bcrypt.hash(String(new_pin), 10)
    await supabase.from('riders').update({ pin_hash: newHash }).eq('id', rider.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
