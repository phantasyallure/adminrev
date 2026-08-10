// Supabase Edge Function: admin-delete-user
//
// Deleting a row from auth.users requires the service-role key, which must
// never be shipped to the browser. This function holds that key server-side:
// it checks the caller is a logged-in admin with can_delete_users, then
// deletes the target auth user (which cascades to profiles via FK).
//
// Deploy:
//   supabase functions deploy admin-delete-user
// Called from the admin app with the admin's own session access token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '')
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  const { targetUserId } = await req.json().catch(() => ({}))
  if (!targetUserId) {
    return new Response(JSON.stringify({ error: 'targetUserId is required' }), { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Identify the caller from their access token, then check permissions.
  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })
  }

  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('can_delete_users')
    .eq('user_id', callerData.user.id)
    .single()

  if (adminError || !adminRow?.can_delete_users) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
