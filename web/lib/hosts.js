// This app (pos.pelbu.com) hosts every role console EXCEPT the super-admin platform console, which
// lives in the auth app (app.pelbu.com) alongside centralized SSO + marketing. Login/signup happen
// there too; unauthenticated users are bounced to app.pelbu.com/login.
//
// Override in dev with NEXT_PUBLIC_AUTH_URL (e.g. http://localhost:3007).
const AUTH = process.env.NEXT_PUBLIC_AUTH_URL || 'https://app.pelbu.com'

export const AUTH_URL = AUTH
export const LOGIN_URL = `${AUTH}/login`

// Role homes. Every console lives in THIS app (relative paths) except SUPER_ADMIN, whose console is
// in the auth app (absolute, cross-subdomain — the shared sb-pelbu-auth cookie carries the session).
export const ROLE_HOME = {
  SUPER_ADMIN: `${AUTH}/admin`,
  DISTRIBUTOR: '/distributor',
  WHOLESALER: '/wholesaler',
  RETAILER: '/pos',
  RIDER: '/rider',
  CUSTOMER: '/shop',
}
