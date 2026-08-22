import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { AUTH_URL, ROLE_HOME } from '@/lib/hosts'

// Public (no auth): consumer marketplace, rider portal login, offline page, customer payment upload.
const PUBLIC_ROUTES = ['/shop', '/rider/login', '/offline', '/pay']

// Next.js 16 proxy convention (replaces middleware.js). Role-routes the monolith; login/signup live
// in the auth app (app.pelbu.com), so those + unauthenticated hits redirect there (shared SSO cookie).
export async function proxy(request) {
  const { pathname } = request.nextUrl
  // Behind Caddy the internal request.url is localhost:PORT; use the configured public URL (or the
  // forwarded host) so redirect targets and the login return-URL point at pos.pelbu.com, not localhost.
  const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  // Auth entry pages live in the auth app.
  if (pathname === '/login' || pathname === '/signup' || pathname.startsWith('/signup/')) {
    return NextResponse.redirect(`${AUTH_URL}/login`)
  }

  // Pass through public routes + Next internals.
  if (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        name: 'sb-pelbu-auth',
        path: '/',
        sameSite: 'lax',
        ...(process.env.NEXT_PUBLIC_COOKIE_DOMAIN ? { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN } : {}),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // No session → central login on the auth app, preserving the intended destination.
  if (!user) {
    const back = new URL(pathname + request.nextUrl.search, ORIGIN).toString()
    return NextResponse.redirect(`${AUTH_URL}/login?redirect=${encodeURIComponent(back)}`)
  }

  const role = user.app_metadata?.role || user.user_metadata?.role

  // Super-admin console lives in the auth app.
  if (role === 'SUPER_ADMIN' && (pathname === '/' || pathname.startsWith('/admin'))) {
    return NextResponse.redirect(`${AUTH_URL}/admin`)
  }

  // Root → the role's home.
  if (pathname === '/') {
    const home = ROLE_HOME[role] || '/pos'
    return NextResponse.redirect(/^https?:/.test(home) ? home : new URL(home, ORIGIN))
  }

  // Console confinement — each commercial role stays in its own console.
  if ((role === 'DISTRIBUTOR' || role === 'WHOLESALER') && pathname.startsWith('/pos')) {
    return NextResponse.redirect(new URL(role === 'DISTRIBUTOR' ? '/distributor' : '/wholesaler', ORIGIN))
  }
  if (role === 'RIDER' && !pathname.startsWith('/rider')) {
    return NextResponse.redirect(new URL('/rider', ORIGIN))
  }
  if (role === 'CUSTOMER' && !pathname.startsWith('/shop')) {
    return NextResponse.redirect(new URL('/shop', ORIGIN))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

export default proxy
