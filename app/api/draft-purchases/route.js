import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/draft-purchases?entity_id=...&status=...
 * List draft purchases for an entity, optionally filtered by status.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entity_id')
  const status = searchParams.get('status')

  if (!entityId) {
    return NextResponse.json({ error: 'entity_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let query = supabase
    .from('draft_purchases')
    .select('*, draft_purchase_items(*)')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ drafts: data ?? [] })
}
