import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { LOGIN_URL, ROLE_HOME } from '@/lib/hosts'

// Public (no auth): login + password reset, the marketing site, consumer marketplace,
// rider portal login, offline page, customer payment upload. The root `/` is also public
// (marketing home) but handled below so signed-in users still land on their console.
const PUBLIC_ROUTES = [
  '/login', '/features', '/sell', '/about', '/contact', '/terms',
  '/shop', '/rider/login', '/offline', '/pay',
]

// Next.js 16 proxy convention (replaces middleware.js). Role-routes the monolith; login and
// password reset render locally (the separate auth app is retired), so unauthenticated hits
// go to this app's own /login.
export async function proxy(request) {
  const { pathname } = request.nextUrl
  // Behind Caddy the internal request.url is localhost:PORT; use the configured public URL (or the
  // forwarded host) so redirect targets point at pos.pelbu.com, not localhost.
  const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  // Legacy signup links: business accounts are admin-created since meeting D7 (2026-08-11),
  // and customers sign up on the login page's customer tab.
  if (pathname === '/signup' || pathname.startsWith('/signup/')) {
    return NextResponse.redirect(new URL(LOGIN_URL, ORIGIN))
  }

  // Pass through public routes + Next internals.
  if (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    // The vision runtime and its model: static, non-secret build assets that ONNX Runtime
    // fetches by URL while the camera pad initialises. Behind the auth gate they answer a 307
    // to /login, and the runtime then reports an HTML page as a corrupt model — a confusing
    // failure that also bites the moment a session expires with the pad open.
    pathname.startsWith('/onnx/') ||
    pathname.startsWith('/models/') ||
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

  // No session → the marketing home at `/`, local login everywhere else, preserving the
  // intended destination (same-app path, not a full URL, so the redirect param can never
  // point off-site).
  if (!user) {
    if (pathname === '/') return response
    const back = pathname + request.nextUrl.search
    return NextResponse.redirect(new URL(`${LOGIN_URL}?redirect=${encodeURIComponent(back)}`, ORIGIN))
  }

  const role = user.app_metadata?.role || user.user_metadata?.role

  // Root → the role's home.
  if (pathname === '/') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] || '/pos', ORIGIN))
  }

  // Console confinement — each commercial role stays in its own console. SUPER_ADMIN roams free
  // (their platform surface lives under /pos/licenses).
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
