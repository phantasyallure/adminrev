// Supabase Edge Function: send-push
//
// Sends an announcement to users: (1) a row in `notifications` so it shows
// in the site's in-app bell, and (2) a real Web Push that pops up on the
// device even when the site is closed.
//
// Body: { title, body, linkPath?, audience: 'all' | 'user', userId? }
// Caller must be an admin with can_send_notifications.
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@corvix.dz)
//
// Deploy:  supabase functions deploy send-push

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'
import { corsHeadersFor, handleCorsPreflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

// Accepts "/lieux/foo", "#comment-ca-marche", a full URL of the main site
// ("https://rayyek.vercel.app/#x"), or even the common typo "/https://..." and
// always returns a safe internal path ("/lieux/foo", "/#comment-ca-marche").
const SITE_HOSTS = new Set(['rayyek.vercel.app', 'reeviewit.vercel.app'])
function normalizeLinkPath(raw: unknown): string {
  let v = String(raw ?? '').trim()
  if (!v) return '/'
  v = v.replace(/^\/+(?=https?:\/\/)/i, '') // "/https://x" -> "https://x"
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v)
      if (!SITE_HOSTS.has(u.hostname)) return '/' // never link off-site
      v = `${u.pathname}${u.search}${u.hash}`
    } catch {
      return '/'
    }
  }
  if (v.startsWith('#')) v = `/${v}`
  if (!v.startsWith('/') || v.startsWith('//')) return '/'
  return v.slice(0, 300)
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
  const callerId = callerData.user.id

  const { data: adminRow } = await admin.from('admin_users').select('can_send_notifications').eq('user_id', callerId).maybeSingle()
  if (!adminRow?.can_send_notifications) return json({ error: 'Not authorized' }, 403)

  const input = await req.json().catch(() => ({}))
  const title = String(input.title ?? '').trim().slice(0, 80)
  const message = String(input.body ?? '').trim().slice(0, 300)
  const audience = input.audience === 'user' ? 'user' : 'all'
  const userId = audience === 'user' ? String(input.userId ?? '') : null
  const linkPath = normalizeLinkPath(input.linkPath)

  if (!title || !message) return json({ error: 'Title and message are required.' }, 400)
  if (audience === 'user' && !userId) return json({ error: 'Pick a user.' }, 400)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: 'VAPID keys are not configured on the server.' }, 500)

  try {
    // 1. Recipients
    let recipientIds: string[] = []
    if (audience === 'user') {
      recipientIds = [userId!]
    } else {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from('profiles').select('id').range(from, from + 999)
        if (error) throw error
        recipientIds.push(...(data ?? []).map((p) => p.id))
        if (!data || data.length < 1000) break
      }
      // skip banned / deleted users
      const { data: blocked } = await admin.from('user_moderation').select('user_id').or('is_banned.eq.true,is_deleted.eq.true')
      const blockedSet = new Set((blocked ?? []).map((b) => b.user_id))
      recipientIds = recipientIds.filter((id) => !blockedSet.has(id))
    }

    // 2. In-app notification rows
    for (let i = 0; i < recipientIds.length; i += 500) {
      const rows = recipientIds.slice(i, i + 500).map((id) => ({
        user_id: id,
        actor_id: callerId,
        type: 'announcement',
        extra_text: `${title} — ${message}`,
        link_path: linkPath,
      }))
      const { error } = await admin.from('notifications').insert(rows)
      if (error) throw error
    }

    // 3. Web Push to every device of those users
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    const subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = []
    for (let i = 0; i < recipientIds.length; i += 200) {
      const { data, error } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .in('user_id', recipientIds.slice(i, i + 200))
      if (error) throw error
      subs.push(...(data ?? []))
    }

    const payload = JSON.stringify({ title, body: message, url: linkPath })
    let pushed = 0
    let failed = 0
    const dead: string[] = []
    for (let i = 0; i < subs.length; i += 25) {
      await Promise.all(
        subs.slice(i, i + 25).map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
            pushed += 1
          } catch (err) {
            failed += 1
            const code = (err as { statusCode?: number })?.statusCode
            if (code === 404 || code === 410) dead.push(s.id) // device unsubscribed
          }
        }),
      )
    }
    if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)

    await admin.from('push_campaigns').insert({
      title, body: message, link_path: linkPath, audience,
      target_user_id: userId, recipients: recipientIds.length, pushed, failed, created_by: callerId,
    })

    return json({ ok: true, recipients: recipientIds.length, devices: subs.length, pushed, failed })
  } catch (err) {
    console.error('[send-push] failed:', err)
    return json({ error: 'Could not send the notification.' }, 500)
  }
})
