import { NextResponse } from 'next/server'

// GET /api/auth/oauth/[provider]?redirect=... — kick off a customer social login by redirecting to
// GoTrue's authorize endpoint. Providers (google, facebook) must be enabled in GoTrue env
// (GOTRUE_EXTERNAL_<PROVIDER>_ENABLED + client id/secret) for this to complete.
const ALLOWED = ['google', 'facebook']

export async function GET(request, { params }) {
  const { provider } = await params
  if (!ALLOWED.includes(provider)) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
  }
  const reqUrl = new URL(request.url)
  const redirect = reqUrl.searchParams.get('redirect') || '/shop'
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || reqUrl.origin
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!supabaseUrl) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })

  const callback = `${appOrigin}/api/auth/oauth/callback?redirect=${encodeURIComponent(redirect)}`
  const authorize = `${supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(callback)}`
  return NextResponse.redirect(authorize)
}
