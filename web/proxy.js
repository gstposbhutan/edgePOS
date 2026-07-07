import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signup', '/offline', '/shop', '/rider/login',
  // Public marketing site (root home, feature pages, vendor onboarding, company)
  '/', '/features', '/sell', '/about', '/contact',
  '/marketing']   // static AI-generated marketing imagery under public/marketing

// Role → home route mapping
const ROLE_HOME = {
  SUPER_ADMIN:  '/admin',
  DISTRIBUTOR:  '/distributor',  // per-role console (re-term 2026-06-08)
  WHOLESALER:   '/wholesaler',
  RETAILER:     '/pos',
  RIDER:        '/rider',
  CUSTOMER:     '/shop',         // public marketplace
}

export async function proxy(request) {
  const { pathname } = request.nextUrl

  // Pass through public routes and Next.js internals
  if (
    PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/')) ||
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
        name: 'sb-edgepos-auth-token',
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // No valid user → redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = user.user_metadata?.role || user.app_metadata?.role

  // Redirect root to role home
  if (pathname === '/') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] || '/pos', request.url))
  }

  // /admin is SUPER_ADMIN only — every other role goes to its own console (no shared routes)
  if (pathname.startsWith('/admin') && role !== 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] || '/pos', request.url))
  }

  // DISTRIBUTOR + WHOLESALER have their own consoles — keep them out of /pos too
  if ((role === 'DISTRIBUTOR' || role === 'WHOLESALER') && pathname.startsWith('/pos')) {
    return NextResponse.redirect(new URL(ROLE_HOME[role], request.url))
  }

  // Riders can only access /rider routes
  if (role === 'RIDER' && !pathname.startsWith('/rider')) {
    return NextResponse.redirect(new URL('/rider', request.url))
  }

  // Customers stay in the marketplace
  if (role === 'CUSTOMER' && !pathname.startsWith('/shop')) {
    return NextResponse.redirect(new URL('/shop', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

// Next.js 16 proxy convention (replaces middleware.js)
export default proxy
