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

// Registers represent physical POS terminals: they are created by the terminal
// itself (keyed by machine_id / MAC) and synced up to the cloud. They cannot be
// created from the web, so this endpoint is intentionally disabled. Renaming /
// deactivating an existing register is still done via the [id] route.
export async function POST() {
  return NextResponse.json(
    { error: 'Registers are created by POS terminals, not from the web.' },
    { status: 405 }
  )
}
