// Supabase Edge Function: import-place-photo
//
// Google Photos URLs pulled from a scrape often block hotlinking or expire,
// and fetching them from the browser hits CORS. This function fetches the
// image server-side (no CORS there) and re-uploads it into the same
// place-photos bucket the manual "Add place" form already uses, so bulk
// imports end up with a stable URL just like a manually-added place.
//
// Deploy:
//   supabase functions deploy import-place-photo
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

  const { photoUrl } = await req.json().catch(() => ({}))
  if (!photoUrl) {
    return new Response(JSON.stringify({ error: 'photoUrl is required' }), { status: 400 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 })
  }

  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('can_manage_places')
    .eq('user_id', callerData.user.id)
    .single()

  if (adminError || !adminRow?.can_manage_places) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 })
  }

  let imgRes
  try {
    imgRes = await fetch(photoUrl)
  } catch {
    return new Response(JSON.stringify({ error: 'Could not reach photo URL' }), { status: 400 })
  }
  if (!imgRes.ok) {
    return new Response(JSON.stringify({ error: `Photo fetch failed (${imgRes.status})` }), { status: 400 })
  }

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = new Uint8Array(await imgRes.arrayBuffer())
  const path = `imported-${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('place-photos')
    .upload(path, bytes, { contentType, upsert: true })

  if (uploadError) {
    return new Response(JSON.stringify({ error: uploadError.message }), { status: 500 })
  }

  const { data: publicUrlData } = admin.storage.from('place-photos').getPublicUrl(path)

  return new Response(JSON.stringify({ url: publicUrlData.publicUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
