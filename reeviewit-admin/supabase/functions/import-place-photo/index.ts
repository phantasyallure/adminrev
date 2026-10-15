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

  const { photoUrl } = await req.json().catch(() => ({}))
  if (!photoUrl) {
    return new Response(JSON.stringify({ error: 'photoUrl is required' }), {
      status: 400,
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

  let imgRes
  try {
    imgRes = await fetch(photoUrl)
  } catch (err) {
    console.error('[import-place-photo] fetch failed:', err)
    return new Response(JSON.stringify({ error: 'Could not reach photo URL' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (!imgRes.ok) {
    return new Response(JSON.stringify({ error: `Photo fetch failed (${imgRes.status})` }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
  // Reject anything that isn't actually an image — photoUrl comes from a
  // human-pasted or scraped link, not a trusted source, and this endpoint
  // fetches it server-side and re-hosts it publicly.
  if (!contentType.startsWith('image/')) {
    return new Response(JSON.stringify({ error: 'That URL is not an image' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const MAX_BYTES = 8 * 1024 * 1024 // 8MB
  const contentLength = Number(imgRes.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Image is too large (8MB max)' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const bytes = new Uint8Array(await imgRes.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Image is too large (8MB max)' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const path = `imported-${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('place-photos')
    .upload(path, bytes, { contentType, upsert: true })

  if (uploadError) {
    console.error('[import-place-photo] upload failed:', uploadError)
    return new Response(JSON.stringify({ error: 'Could not store this photo.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { data: publicUrlData } = admin.storage.from('place-photos').getPublicUrl(path)

  return new Response(JSON.stringify({ url: publicUrlData.publicUrl }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
