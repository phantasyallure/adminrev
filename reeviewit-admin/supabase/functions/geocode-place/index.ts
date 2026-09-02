// Supabase Edge Function: geocode-place
//
// Turns a free-text address into { lat, lng } using OpenStreetMap's free
// Nominatim geocoder. This used to be called directly from the browser,
// but Nominatim's usage policy requires a proper identifying User-Agent
// and disallows bulk/automated querying from a single client — running
// 200+ lookups in a row straight from someone's browser tab reliably
// tripped that and got every request rejected (fixed: 0 every time).
// Doing it server-side, once per call, with a real User-Agent set,
// avoids that entirely and keeps the client-side rate-limit pacing as
// the only throttle that matters.
//
// Deploy:
//   supabase functions deploy geocode-place
// Called from the admin app with the admin's own session access token.

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

  const { address } = await req.json().catch(() => ({}))
  if (!address || !String(address).trim()) {
    return new Response(JSON.stringify({ lat: null, lng: null }), {
      status: 200,
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

  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('can_manage_places')
    .eq('user_id', callerData.user.id)
    .single()

  if (adminError || !adminRow?.can_manage_places) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const query = `${String(address).trim()}, Oran, Algérie`
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Nominatim's usage policy requires identifying the calling
        // application — anonymous/browser-default User-Agents get
        // silently rejected under any real load.
        'User-Agent': 'Reeviewit-Admin/1.0 (+https://rayyek.vercel.app)',
      },
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ lat: null, lng: null, status: res.status }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    const results = await res.json()
    const hit = results?.[0]
    const lat = hit ? parseFloat(hit.lat) : null
    const lng = hit ? parseFloat(hit.lon) : null
    const valid = Number.isFinite(lat) && Number.isFinite(lng)
    return new Response(JSON.stringify({ lat: valid ? lat : null, lng: valid ? lng : null }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // Log the real error server-side only — never echo raw exception/stack
    // details back to the client.
    console.error('[geocode-place] Nominatim request failed:', err)
    return new Response(JSON.stringify({ lat: null, lng: null }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
