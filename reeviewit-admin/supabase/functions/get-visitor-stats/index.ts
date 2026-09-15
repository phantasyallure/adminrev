// Supabase Edge Function: get-visitor-stats
//
// site_visits has RLS enabled with no policies, so nothing in the browser
// can read it directly — not even a logged-in admin. This function holds
// the service-role key server-side, confirms the caller is a logged-in
// admin (any admin — this isn't sensitive enough to gate behind a specific
// permission the way user deletion or role changes are), then returns
// aggregated counts.
//
// Deploy:
//   supabase functions deploy get-visitor-stats

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeadersFor, handleCorsPreflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req)
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '')
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Any row in admin_users counts as an admin — no specific permission
  // required to view visitor stats.
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', callerData.user.id)
    .single()

  if (!adminRow) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [{ count: totalVisits }, { count: visitsToday }, { data: rows }, { data: recent }] =
      await Promise.all([
        admin.from('site_visits').select('*', { count: 'exact', head: true }),
        admin.from('site_visits').select('*', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
        admin.from('site_visits').select('ip_address, country').limit(20000),
        admin
          .from('site_visits')
          .select('ip_address, country, city, path, created_at')
          .order('created_at', { ascending: false })
          .limit(25),
      ])

    const uniqueIps = new Set((rows ?? []).map((r) => r.ip_address).filter(Boolean))

    const countryCounts = {}
    for (const r of rows ?? []) {
      const c = r.country || 'Unknown'
      countryCounts[c] = (countryCounts[c] || 0) + 1
    }
    const byCountry = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)

    return new Response(
      JSON.stringify({
        totalVisits: totalVisits ?? 0,
        visitsToday: visitsToday ?? 0,
        uniqueIps: uniqueIps.size,
        byCountry,
        recent: recent ?? [],
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[get-visitor-stats] failed:', err)
    return new Response(JSON.stringify({ error: 'Could not load visitor stats.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
