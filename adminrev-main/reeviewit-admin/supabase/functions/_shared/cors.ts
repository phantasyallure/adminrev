// Shared CORS headers for Supabase Edge Functions called directly from the
// admin panel's browser JS. Without these, the browser's automatic
// preflight OPTIONS request gets a plain 404/405 back (no
// Access-Control-Allow-* headers), which the browser treats as a failed
// preflight and blocks the real request before it's ever sent — showing up
// as "has been blocked by CORS policy" in devtools even though the
// function itself never got a chance to run.
//
// These functions hold the service-role key and act on a caller's bearer
// token, so a wildcard '*' here means ANY website — not just this admin
// panel — is allowed to call them from a browser. That's not exploitable
// on its own (an attacker still needs a valid admin token, which nothing
// here hands out), but it removes a layer of defense for free: if a token
// were ever stolen some other way (XSS, a leaked log, etc.), an allowlist
// at least confines *browser*-based abuse to requests that claim to come
// from this app's own origins. Add any other real deployment origin below.
const ALLOWED_ORIGINS = new Set([
  'https://rayyek.vercel.app',
  'https://adminrev.vercel.app', // the admin panel's actual production domain
  'http://localhost:5173', // local admin dev server (vite default)
])

export function corsHeadersFor(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

// Call at the top of every Deno.serve handler: returns a response for an
// OPTIONS preflight, or null if this isn't one (continue handling normally).
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) })
  }
  return null
}
