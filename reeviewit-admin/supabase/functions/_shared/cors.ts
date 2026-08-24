// Shared CORS headers for Supabase Edge Functions called directly from the
// admin panel's browser JS. Without these, the browser's automatic
// preflight OPTIONS request gets a plain 404/405 back (no
// Access-Control-Allow-* headers), which the browser treats as a failed
// preflight and blocks the real request before it's ever sent — showing up
// as "has been blocked by CORS policy" in devtools even though the
// function itself never got a chance to run.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Call at the top of every Deno.serve handler: returns a response for an
// OPTIONS preflight, or null if this isn't one (continue handling normally).
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  return null
}
