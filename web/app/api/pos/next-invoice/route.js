import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * GET /api/pos/next-invoice — live PREVIEW of the next order number + the server's
 * current time (the trusted invoice clock). Used by the POS header so the cashier
 * can see the upcoming invoice no (e.g. DAWA-2026-00006) and an internet-sourced
 * date/time, and so an admin can back/forward-date.
 *
 * The number is a PEEK, not a reservation: it reads pos_order_counters.last_serial + 1.
 * The real number is allocated atomically at order creation by next_pos_order_no(), so
 * under concurrent terminals the final number may differ — acceptable for a display.
 *
 * Prefix logic mirrors next_pos_order_no() exactly: UPPER(name) stripped of
 * non-alphanumerics, LEFT 4 (or 'POS'), then PREFIX-YEAR-NNNNN.
 */
function formatOrderNo(prefixRaw, year, serial) {
  const clean = (prefixRaw ?? '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const prefix = clean.slice(0, 4) || 'POS'
  return `${prefix}-${year}-${String(serial).padStart(5, '0')}`
}

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { entityId, supabase } = ctx
  const now = new Date()
  const year = now.getUTCFullYear()

  const { data: entity } = await supabase
    .from('entities')
    .select('name')
    .eq('id', entityId)
    .single()

  const { data: counter } = await supabase
    .from('pos_order_counters')
    .select('last_serial')
    .eq('seller_id', entityId)
    .eq('year', year)
    .maybeSingle()

  const nextSerial = Number(counter?.last_serial ?? 0) + 1
  const orderNo = formatOrderNo(entity?.name, year, nextSerial)

  return NextResponse.json({
    orderNo,
    serverTime: now.toISOString(),
    invoiceDate: now.toISOString(),
  })
}
