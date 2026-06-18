import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/supabase/server'

/**
 * POST /api/account/password — self-service password change for the logged-in user.
 * Updates the Supabase password; the terminal mirrors the new bcrypt hash on its next
 * bootstrap, keeping web + terminal logins on the same password.
 */
export async function POST(request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { password } = await request.json()
  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const { error } = await ctx.supabase.auth.admin.updateUserById(ctx.userId, { password })
  if (error) return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })

  return NextResponse.json({ success: true })
}
