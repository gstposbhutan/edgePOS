import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signup', '/offline', '/shop']

// Role → home route mapping
const ROLE_HOME = {
  SUPER_ADMIN:  '/admin',
  DISTRIBUTOR:  '/admin',
  WHOLESALER:   '/admin',
  RETAILER:     '/pos',
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
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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

  const { data: { session } } = await supabase.auth.getSession()

  // No session → redirect to login
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = session.user?.user_metadata?.role || session.user?.app_metadata?.role

  // Redirect root to role home
  if (pathname === '/') {
    return NextResponse.redirect(new URL(ROLE_HOME[role] || '/pos', request.url))
  }

  // Block RETAILER from /admin — except OWNERs who manage multiple stores
  const subRole = session.user?.user_metadata?.sub_role || session.user?.app_metadata?.sub_role
  if (pathname.startsWith('/admin') && role === 'RETAILER' && subRole !== 'OWNER') {
    return NextResponse.redirect(new URL('/pos', request.url))
  }

  // Block WHOLESALER/DISTRIBUTOR from /pos routes
  if (pathname.startsWith('/pos') && (role === 'WHOLESALER' || role === 'DISTRIBUTOR')) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

// Next.js 16 proxy convention (replaces middleware.js)
export default proxy
