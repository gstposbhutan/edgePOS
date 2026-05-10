import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) { return cookieStore.get(name)?.value },
          set(name, value, options) { cookieStore.set({ name, value, ...options }) },
          remove(name, options) { cookieStore.set({ name, value: '', ...options }) },
        },
      }
    )
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { current_pin, new_pin } = await request.json()
    if (!current_pin || !new_pin || new_pin.length < 4) {
      return NextResponse.json({ error: 'Current PIN and new PIN (min 4 digits) are required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const { data: rider } = await serviceClient
      .from('riders')
      .select('id, pin_hash')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

    const valid = await bcrypt.compare(String(current_pin), rider.pin_hash)
    if (!valid) return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 400 })

    const newHash = await bcrypt.hash(String(new_pin), 10)
    await serviceClient.from('riders').update({ pin_hash: newHash }).eq('id', rider.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
