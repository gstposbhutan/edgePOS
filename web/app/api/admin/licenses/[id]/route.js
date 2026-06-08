import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

// DELETE /api/admin/licenses/[id] — revoke a license (super-admin). Soft: licenses.is_active=false
// AND deactivate the embedded sync token, so the terminal is blocked at both the license
// revocation check and the sync ingest.
export async function DELETE(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Super-admin only' }, { status: 403 })

  const { id } = await params
  const { data: lic, error } = await ctx.supabase
    .from('licenses').update({ is_active: false }).eq('id', id).select('token_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!lic) return NextResponse.json({ error: 'License not found' }, { status: 404 })

  if (lic.token_id) {
    await ctx.supabase.from('terminal_tokens').update({ is_active: false }).eq('id', lic.token_id)
  }
  return NextResponse.json({ success: true })
}
