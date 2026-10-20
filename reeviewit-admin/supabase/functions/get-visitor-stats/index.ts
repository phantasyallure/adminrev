// Supabase Edge Function: get-visitor-stats
//
// site_visits has RLS enabled with no policies, so the browser can't read
// it. This function (service role) checks the caller is an admin, then asks
// Postgres for per-day numbers (see supabase/admin_overhaul.sql).
//
// Body (all optional): { day: 'YYYY-MM-DD', days: 30 }
//   day  -> which day to break down (default: today, Algeria time)
//   days -> how many days of history for the chart (max 365)
//
// Deploy:  supabase functions deploy get-visitor-stats

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeadersFor, handleCorsPreflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function todayInAlgiers(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date())
}

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })

  const callerToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!callerToken) return json({ error: 'Missing Authorization header' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerData?.user) return json({ error: 'Invalid session' }, 401)

  const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', callerData.user.id).maybeSingle()
  if (!adminRow) return json({ error: 'Not authorized' }, 403)

  const body = await req.json().catch(() => ({}))
  const today = todayInAlgiers()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body?.day ?? '') ? body.day : today
  const days = Math.min(Math.max(parseInt(body?.days ?? 30, 10) || 30, 7), 365)

  try {
    const [daily, selected, allTime] = await Promise.all([
      admin.rpc('visitor_daily_counts', { p_days: days }),
      admin.rpc('visitor_day_summary', { p_day: day }),
      admin.rpc('visitor_all_time'),
    ])
    if (daily.error) throw daily.error
    if (selected.error) throw selected.error
    if (allTime.error) throw allTime.error

    return json({
      today,
      day,
      daily: daily.data ?? [],
      selected: selected.data,
      allTime: allTime.data,
    })
  } catch (err) {
    console.error('[get-visitor-stats] failed:', err)
    return json({ error: 'Could not load visitor stats. Did you run supabase/admin_overhaul.sql?' }, 500)
  }
})
