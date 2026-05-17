import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * DELETE /api/face-profiles/[id]
 * GDPR deletion — zeroes embedding, marks deleted via RPC.
 */
export async function DELETE(request, { params }) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 })

  const supabase = ctx.supabase
  const { error } = await supabase.rpc('delete_face_profile', {
    p_profile_id: id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
