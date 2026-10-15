// Supabase Edge Function: suggest-keywords
//
// Looks at ONE place — its name, category, neighborhood, existing
// keywords, and its cover photo — and asks a vision-capable AI model for
// additional search keywords describing its vibe/use-case (e.g. "date
// spot", "calm", "authentic", "family friendly", "quick bite"), beyond
// the handful typed in when the place was first added.
//
// Uses Google's Gemini API because it has a genuine free tier that
// includes image input — no billing needed to run this across a place
// list. Get a key at https://aistudio.google.com/apikey and set it as
// the GEMINI_API_KEY secret:
//   supabase secrets set GEMINI_API_KEY=your-key-here
//
// Called ONCE PER PLACE from the client, with a short delay between
// calls (see suggestKeywordsForPlace in adminApi.js) — scanning all
// places happens as a client-side loop, not inside this function, so a
// long scan never risks the function's own execution-time limit and
// naturally respects Gemini's free-tier rate limits.
//
// Deploy:
//   supabase functions deploy suggest-keywords

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeadersFor, handleCorsPreflight } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = 'gemini-2.0-flash'

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req)
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const jsonHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '')
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: jsonHeaders })
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server' }), { status: 500, headers: jsonHeaders })
  }

  const { place_id } = await req.json().catch(() => ({}))
  if (!place_id) {
    return new Response(JSON.stringify({ error: 'place_id is required' }), { status: 400, headers: jsonHeaders })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: callerData, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: jsonHeaders })
  }

  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('can_manage_places')
    .eq('user_id', callerData.user.id)
    .single()

  if (adminError || !adminRow?.can_manage_places) {
    return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403, headers: jsonHeaders })
  }

  const { data: place, error: placeError } = await admin
    .from('places')
    .select('id, name, category, neighborhood, keywords, cover_image_url')
    .eq('id', place_id)
    .single()

  if (placeError || !place) {
    return new Response(JSON.stringify({ error: 'Place not found' }), { status: 404, headers: jsonHeaders })
  }

  try {
    const parts: Record<string, unknown>[] = [{ text: buildPrompt(place) }]

    if (place.cover_image_url) {
      const imagePart = await fetchImageAsInlineData(place.cover_image_url)
      if (imagePart) parts.push(imagePart)
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '')
      console.error('[suggest-keywords] Gemini request failed:', geminiRes.status, errText)
      await recordError(admin, place_id, `Gemini API error (${geminiRes.status})`)
      return new Response(JSON.stringify({ error: 'AI request failed' }), { status: 502, headers: jsonHeaders })
    }

    const geminiJson = await geminiRes.json()
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const suggested = parseKeywordList(rawText, place.keywords || [])

    if (!suggested.length) {
      await recordError(admin, place_id, 'Model returned no usable keywords')
      return new Response(JSON.stringify({ suggested: [] }), { status: 200, headers: jsonHeaders })
    }

    const { error: upsertError } = await admin
      .from('keyword_suggestions')
      .upsert(
        {
          place_id,
          suggested_keywords: suggested,
          model: GEMINI_MODEL,
          status: 'pending',
          error: null,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'place_id', ignoreDuplicates: false }
      )

    if (upsertError) {
      // The partial unique index only covers status='pending' rows, so a
      // plain upsert can still collide with an old approved/rejected row
      // for the same place — fall back to a plain insert in that case.
      await admin.from('keyword_suggestions').insert({
        place_id,
        suggested_keywords: suggested,
        model: GEMINI_MODEL,
        status: 'pending',
      })
    }

    return new Response(JSON.stringify({ suggested }), { status: 200, headers: jsonHeaders })
  } catch (err) {
    console.error('[suggest-keywords] unexpected error:', err)
    await recordError(admin, place_id, 'Unexpected server error')
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { status: 500, headers: jsonHeaders })
  }
})

function buildPrompt(place: { name: string; category: string | null; neighborhood: string | null; keywords: string[] | null }) {
  const existing = (place.keywords || []).join(', ') || '(none yet)'
  return `You help tag local businesses in Oran, Algeria for a restaurant/cafe discovery app's search bar.

Place name: ${place.name}
Category: ${place.category || 'unknown'}
Neighborhood: ${place.neighborhood || 'unknown'}
Existing keywords: ${existing}

Look at the cover photo if one is attached. Based on the name, category, and — most importantly — what the photo actually shows (lighting, seating, decor, plating, crowd if visible), suggest 5 to 8 NEW search keywords that are not already in the existing keywords list.

Mix two kinds of keywords:
1. Cuisine/dish descriptors (e.g. "spicy", "grilled", "seafood", "authentic")
2. Vibe/use-case descriptors genuinely supported by what you can see or reasonably infer (e.g. "cozy", "date spot", "family friendly", "quick bite", "for groups", "quiet", "lively", "budget friendly", "upscale")

Be conservative on vibe/use-case claims — only include one if the photo or context actually supports it. Do not invent specific facts (prices, dishes, awards) that aren't visible.

Respond with ONLY a JSON array of lowercase strings, nothing else. Example: ["cozy", "grilled", "date spot"]`
}

function parseKeywordList(rawText: string, existing: string[]): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    // Model occasionally wraps the array in prose despite instructions —
    // try to salvage the first [...] block before giving up.
    const match = rawText.match(/\[[\s\S]*\]/)
    if (!match) return []
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []

  const existingLower = new Set((existing || []).map((k) => String(k).trim().toLowerCase()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of parsed) {
    const kw = String(item).trim().toLowerCase()
    if (!kw || kw.length > 40 || existingLower.has(kw) || seen.has(kw)) continue
    seen.add(kw)
    out.push(kw)
    if (out.length >= 8) break
  }
  return out
}

async function fetchImageAsInlineData(url: string): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    // Cap payload size sent to the model — cover photos should already be
    // reasonably sized, this just guards against an unexpectedly huge file.
    if (buf.byteLength > 8 * 1024 * 1024) return null
    let binary = ''
    for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i])
    const base64 = btoa(binary)
    return { inlineData: { mimeType: contentType, data: base64 } }
  } catch (err) {
    console.error('[suggest-keywords] could not fetch cover image:', err)
    return null
  }
}

async function recordError(admin: ReturnType<typeof createClient>, place_id: string, message: string) {
  try {
    await admin.from('keyword_suggestions').upsert(
      { place_id, suggested_keywords: [], status: 'pending', error: message, created_at: new Date().toISOString() },
      { onConflict: 'place_id', ignoreDuplicates: false }
    )
  } catch {
    // best-effort only
  }
}
