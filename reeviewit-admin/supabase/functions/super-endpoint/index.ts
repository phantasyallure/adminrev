// Supabase Edge Function: super-endpoint (a.k.a. "admin-create-user" in the
// Supabase dashboard's function list — the display name was renamed at
// some point but the URL slug, and what the frontend actually calls via
// functionUrl('super-endpoint'), has stayed super-endpoint).
//
// Creates a brand-new login (email + password) purely for accessing the
// admin panel — no email confirmation step, no connection to how someone
// signed up on the public site. Only an existing admin with
// can_manage_roles is allowed to call this. Requires the service-role key,
// which is why this has to run server-side rather than in the browser.
//
// Deploy:
//   supabase functions deploy super-endpoint

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeadersFor, handleCorsPreflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PERMISSION_KEYS = [
  'can_approve_reviews',
  'can_delete_reviews',
  'can_manage_places',
  'can_ban_users',
  'can_delete_users',
  'can_award_badges',
  'can_manage_roles',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req)
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '')
  if (!callerToken) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  const body = await req.json().catch(() => ({}))
  const { email, password, roleLabel, permissions } = body

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'A valid email is required' }, 400)
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return jsonResponse({ error: 'Password must be at least 8 characters' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerData?.user) {
    return jsonResponse({ error: 'Invalid session' }, 401)
  }

  const { data: callerAdminRow, error: callerAdminError } = await admin
    .from('admin_users')
    .select('can_manage_roles')
    .eq('user_id', callerData.user.id)
    .single()

  if (callerAdminError || !callerAdminRow?.can_manage_roles) {
    return jsonResponse({ error: 'Not authorized' }, 403)
  }

  // Create the login. email_confirm: true skips the confirmation email
  // entirely — this account can sign in immediately.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: email.split('@')[0],
      is_staff_account: true,
    },
  })

  if (createError || !created?.user) {
    // Log the real Supabase error for our own records, but the caller here
    // is always an already-authenticated can_manage_roles admin (not a
    // public signup form), so showing them the actual reason — e.g.
    // "already registered" — is genuinely useful and low-risk.
    console.error('[super-endpoint] createUser failed:', createError)
    return jsonResponse({ error: createError?.message || 'Could not create account' }, 500)
  }

  const newUserId = created.user.id

  // Flag this account as staff so it's excluded from reviewer-facing lists
  // (search results when granting place ownership, public user listings,
  // etc). is_staff lives on user_moderation, NOT on profiles — a prior
  // version of this function wrote `is_staff` onto the profiles row
  // instead, which either errored silently (the column doesn't exist
  // there) or wrote to a field nothing else ever reads. Either way, staff
  // accounts were never actually being flagged. Upsert so this also works
  // if a user_moderation row doesn't exist yet for a brand-new user.
  const { error: staffFlagError } = await admin
    .from('user_moderation')
    .upsert({ user_id: newUserId, is_staff: true }, { onConflict: 'user_id' })
  if (staffFlagError) {
    // Not fatal — the account and its admin role are still created and
    // usable either way, this only affects whether it's hidden from
    // reviewer-facing user search. Log it so it's visible, don't block.
    console.error('[super-endpoint] failed to flag account as staff:', staffFlagError)
  }

  // Grant the admin role in the same call.
  const permRow = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, Boolean(permissions?.[k])]))
  const { error: adminInsertError } = await admin.from('admin_users').insert({
    user_id: newUserId,
    role_label: roleLabel || 'Moderator',
    created_by: callerData.user.id,
    ...permRow,
  })

  if (adminInsertError) {
    console.error('[super-endpoint] admin_users insert failed:', adminInsertError)
    // Roll back the auth user so we don't leave an orphaned login.
    await admin.auth.admin.deleteUser(newUserId)
    return jsonResponse({ error: adminInsertError.message }, 500)
  }

  return jsonResponse({ ok: true, userId: newUserId }, 200)
})
