// Standalone host map. The former auth app (app.pelbu.com) is retired — this app now hosts
// every surface itself: login/password-reset, all role consoles, the consumer shop, and the
// super-admin platform tools. Every destination is a same-app relative path; the proxy
// resolves them against NEXT_PUBLIC_APP_URL (the app's own public URL) where needed.
export const LOGIN_URL = '/login'

// Consumer marketplace storefront.
export const MARKETPLACE_URL = '/shop'

// Where each role lands after login. SUPER_ADMIN's platform console is the reactivated
// license/admin surface (see app/pos/licenses + app/api/admin/*).
export const ROLE_HOME = {
  SUPER_ADMIN: '/pos/licenses',
  DISTRIBUTOR: '/distributor',
  WHOLESALER: '/wholesaler',
  RETAILER: '/pos',
  RIDER: '/rider',
  CUSTOMER: '/shop',
}
