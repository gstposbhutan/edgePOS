// Supabase client factories + shared auth-cookie contract.
// (Inlined from the former @pelbu/db workspace package when the POS moved
// back to this standalone repo — same code, no behavior change.)
import { createBrowserClient, createServerClient } from "@supabase/ssr";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// In production set NEXT_PUBLIC_COOKIE_DOMAIN=.pelbu.com (SSO across subdomains).
// In local dev leave it unset so the cookie is host-scoped (localhost works).
const rawDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
export const COOKIE_DOMAIN =
  rawDomain && rawDomain.length > 0 ? rawDomain : undefined;

const cookieOptions = {
  name: "sb-pelbu-auth",
  path: "/",
  sameSite: "lax",
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
};

/** Browser (client component) Supabase client. */
export function createClient() {
  return createBrowserClient(url(), anon(), { cookieOptions });
}

/**
 * Server (RSC / route handler / middleware) Supabase client.
 * @param cookies  cookie adapter ({ getAll, setAll }).
 * @param options  optional; `{ schema }` sets the default PostgREST schema
 *   (the POS passes 'pos' — its tables live there since the schema move).
 */
export function createServer(cookies, options = {}) {
  return createServerClient(url(), anon(), {
    cookieOptions,
    cookies,
    ...(options.schema ? { db: { schema: options.schema } } : {}),
  });
}
