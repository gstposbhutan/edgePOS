import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

export async function GET(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Listing registers is read-only and entity-scoped — any authenticated user in the
  // store needs it (a CASHIER picks a register when starting a shift). Management
  // (rename/deactivate) stays manager-gated on the [id] route; creation is disabled.
  const { entityId, supabase } = ctx
  const { data: registers, error } = await supabase
    .from('cash_registers')
    .select('id, name, default_opening_float, is_active, created_at, mode, machine_id, license:licenses!licenses_register_id_fkey(id, lic_id, is_active, expires_at)')
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
