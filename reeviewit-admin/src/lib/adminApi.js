import { supabase } from '../supabaseClient'
import { compressImage } from './imageCompress'

// ---------- Reviews ----------

export async function fetchReviews({ status = 'pending', q = '' } = {}) {
  let query = supabase
    .from('reviews')
    .select(
      'id, body, rating_food, rating_service, rating_cleanliness, rating_price, rating_vibe, status, verification_level, created_at, place_id, author_id, places:place_id ( name ), profiles:author_id ( display_name )'
    )
    .order('created_at', { ascending: false })

  if (status !== 'all') query = query.eq('status', status)
  if (q) query = query.ilike('body', `%${q}%`)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function setReviewStatus(reviewId, status, moderatorId) {
  const { error } = await supabase
    .from('reviews')
    .update({ status, moderated_by: moderatorId, moderated_at: new Date().toISOString() })
    .eq('id', reviewId)
  if (error) throw error
}

export async function deleteReview(reviewId) {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId)
  if (error) throw error
}

// ---------- Product posts ----------

export async function fetchProductPosts({ status = 'pending', q = '' } = {}) {
  let query = supabase
    .from('product_posts')
    .select(
      'id, image_url, caption, keywords, status, created_at, user_id, place_id, profiles:user_id ( display_name ), places:place_id ( name )'
    )
    .order('created_at', { ascending: false })

  if (status !== 'all') query = query.eq('status', status)
  if (q) query = query.or(`caption.ilike.%${q}%,keywords.cs.{${q.toLowerCase()}}`)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function setProductPostStatus(postId, status, moderatorId) {
  const { error } = await supabase
    .from('product_posts')
    .update({ status, moderated_by: moderatorId, moderated_at: new Date().toISOString() })
    .eq('id', postId)
  if (error) throw error
}

export async function deleteProductPost(postId) {
  const { error } = await supabase.from('product_posts').delete().eq('id', postId)
  if (error) throw error
}

// ---------- Places ----------

const PLACE_COLUMNS =
  'id, name, slug, category, neighborhood, address, lat, lng, price_range, cover_image_url, keywords, google_maps_url, featured_rank, created_at, google_rating, google_rating_count'

// Best-effort: pull lat/lng out of a pasted Google Maps link when the URL
// happens to contain them (e.g. ".../@35.6969,-0.6335,15z" or
// "...!3d35.6969!4d-0.6335" or "?q=35.6969,-0.6335"). Not all Maps links
// carry coordinates (short "goo.gl/maps" links usually don't) — that's
// fine, the link itself is still saved either way.
export function extractLatLngFromMapsUrl(url) {
  if (!url) return null
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }
  const dMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (dMatch) return { lat: parseFloat(dMatch[1]), lng: parseFloat(dMatch[2]) }
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }
  return null
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function fetchPlaces({ q = '' } = {}) {
  let query = supabase.from('places').select(PLACE_COLUMNS).order('created_at', { ascending: false })
  if (q) query = query.or(`name.ilike.%${q}%,neighborhood.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error

  // Attach live rating from the place_ratings view.
  const { data: ratings } = await supabase
    .from('place_ratings')
    .select('place_id, review_count, raw_score')
    .in('place_id', (data ?? []).map((p) => p.id).length ? (data ?? []).map((p) => p.id) : ['00000000-0000-0000-0000-000000000000'])
  const byPlace = Object.fromEntries((ratings ?? []).map((r) => [r.place_id, r]))
  return (data ?? []).map((p) => ({
    ...p,
    reviewCount: byPlace[p.id]?.review_count ?? 0,
    score: byPlace[p.id]?.raw_score ?? null,
  }))
}

export async function createPlace(place) {
  const coords = extractLatLngFromMapsUrl(place.google_maps_url)
  const payload = {
    name: place.name,
    slug: place.slug?.trim() || slugify(place.name),
    category: place.category || 'restaurant',
    neighborhood: place.neighborhood || null,
    address: place.address || null,
    price_range: place.price_range || null,
    cover_image_url: place.cover_image_url || null,
    keywords: place.keywords || [],
    google_maps_url: place.google_maps_url || null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  }
  const { data, error } = await supabase.from('places').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function updatePlace(id, place) {
  const coords = extractLatLngFromMapsUrl(place.google_maps_url)
  const payload = {
    name: place.name,
    slug: place.slug?.trim() || slugify(place.name),
    category: place.category || 'restaurant',
    neighborhood: place.neighborhood || null,
    address: place.address || null,
    price_range: place.price_range || null,
    cover_image_url: place.cover_image_url || null,
    keywords: place.keywords || [],
    google_maps_url: place.google_maps_url || null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('places').update(payload).eq('id', id)
  if (error) throw error
}

export async function deletePlace(id) {
  const { error } = await supabase.from('places').delete().eq('id', id)
  if (error) throw error
}

// Sets/clears a place's spot in the homepage carousel. Pass null to remove
// it from the featured strip. Lower numbers show first.
export async function setPlaceFeaturedRank(id, rank) {
  const { error } = await supabase
    .from('places')
    .update({ featured_rank: rank })
    .eq('id', id)
  if (error) throw error
}

export async function uploadPlacePhoto(file) {
  const compressed = await compressImage(file)
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('place-photos')
    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('place-photos').getPublicUrl(path)
  return data.publicUrl
}

// ---------- Category images (homepage tiles: restaurant / cafeteria / etc.) ----------

export async function fetchCategoryImages() {
  const { data, error } = await supabase.from('category_images').select('category, image_url, updated_at')
  if (error) throw error
  return data ?? []
}

export async function uploadCategoryImage(category, file) {
  const compressed = await compressImage(file)
  const path = `${category}-${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('category-images')
    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
  if (uploadError) throw uploadError
  const { data: urlData } = supabase.storage.from('category-images').getPublicUrl(path)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('category_images')
    .upsert(
      { category, image_url: urlData.publicUrl, updated_at: new Date().toISOString(), updated_by: user?.id ?? null },
      { onConflict: 'category' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// Builds the Edge Function URL from the same Supabase project URL already
// configured in .env — no separate setting needed.
export function functionUrl(name) {
  const base = import.meta.env.VITE_SUPABASE_URL ?? ''
  return `${base}/functions/v1/${name}`
}

// ---------- Users ----------

export async function fetchUsers({ q = '' } = {}) {
  let query = supabase
    .from('profiles')
    .select('id, display_name, avatar_url, is_banned, banned_reason, is_deleted, is_staff, created_at')
    .eq('is_staff', false)
    .order('created_at', { ascending: false })
  if (q) query = query.ilike('display_name', `%${q}%`)
  const { data, error } = await query
  if (error) throw error

  const { data: counts } = await supabase.from('user_review_counts').select('user_id, review_count')
  const byUser = Object.fromEntries((counts ?? []).map((c) => [c.user_id, c.review_count]))

  const { data: badges } = await supabase.from('user_badges').select('user_id, badges:badge_id ( id, name, icon, icon_url, color )')
  const badgesByUser = {}
  for (const b of badges ?? []) {
    if (!badgesByUser[b.user_id]) badgesByUser[b.user_id] = []
    if (b.badges) badgesByUser[b.user_id].push(b.badges)
  }

  return (data ?? [])
    .filter((u) => !u.is_deleted)
    .map((u) => ({ ...u, reviewCount: byUser[u.id] ?? 0, badges: badgesByUser[u.id] ?? [] }))
}

export async function setUserBanned(userId, isBanned, reason) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: isBanned, banned_reason: isBanned ? reason || null : null, banned_at: isBanned ? new Date().toISOString() : null })
    .eq('id', userId)
  if (error) throw error
}

// Soft delete: anonymizes the profile. Full auth-account removal requires
// the admin-delete-user Edge Function (service role) — see supabase/functions.
export async function softDeleteUser(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_deleted: true, is_banned: true, display_name: 'Deleted user' })
    .eq('id', userId)
  if (error) throw error
}

export async function hardDeleteUser(userId, accessToken) {
  const res = await fetch(functionUrl('admin-delete-user'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ targetUserId: userId }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Delete failed')
  }
}

// ---------- Badges ----------

export async function fetchBadges() {
  const { data, error } = await supabase.from('badges').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createBadge(badge) {
  const { data, error } = await supabase.from('badges').insert(badge).select().single()
  if (error) throw error
  return data
}

export async function deleteBadge(id) {
  const { error } = await supabase.from('badges').delete().eq('id', id)
  if (error) throw error
}

export async function uploadBadgeIcon(file) {
  const ext = file.name.split('.').pop() || 'svg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('badge-icons').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('badge-icons').getPublicUrl(path)
  return data.publicUrl
}

export async function awardBadge(userId, badgeId, awardedBy) {
  const { error } = await supabase.from('user_badges').insert({ user_id: userId, badge_id: badgeId, awarded_by: awardedBy })
  if (error) throw error
}

export async function revokeBadge(userId, badgeId) {
  const { error } = await supabase.from('user_badges').delete().eq('user_id', userId).eq('badge_id', badgeId)
  if (error) throw error
}

export async function fetchTopReviewers(limit = 10) {
  const { data, error } = await supabase
    .from('user_review_counts')
    .select('*')
    .order('review_count', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ---------- Admin roles ----------

export async function fetchAdmins() {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*, profiles:user_id ( display_name, avatar_url )')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function findProfileByName(q) {
  const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').ilike('display_name', `%${q}%`).limit(10)
  if (error) throw error
  return data ?? []
}

// Creates a brand-new login just for the admin panel (email + password, no
// email confirmation, no link to any reviewer/Google account) and grants it
// permissions in one call. Requires the admin-create-user Edge Function.
export async function createStaffAdmin({ email, password, roleLabel, permissions }, accessToken) {
  const res = await fetch(functionUrl('super-endpoint'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ email, password, roleLabel, permissions }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not create account')
  }
  return res.json()
}

export async function upsertAdmin(userId, permissions, createdBy) {
  const { error } = await supabase.from('admin_users').upsert({ user_id: userId, created_by: createdBy, ...permissions })
  if (error) throw error
}

export async function removeAdmin(userId) {
  const { error } = await supabase.from('admin_users').delete().eq('user_id', userId)
  if (error) throw error
}

// ---------- Dashboard ----------

export async function fetchDashboardStats() {
  const [{ count: pendingReviews }, { count: pendingProductPosts }, { count: totalPlaces }, { count: totalUsers }, { count: bannedUsers }] = await Promise.all([
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('product_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('places').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', true),
  ])
  return {
    pendingReviews: pendingReviews ?? 0,
    pendingProductPosts: pendingProductPosts ?? 0,
    totalPlaces: totalPlaces ?? 0,
    totalUsers: totalUsers ?? 0,
    bannedUsers: bannedUsers ?? 0,
  }
}
// ---------- Place suggestions ----------

export async function fetchPlaceSuggestions({ status = 'pending' } = {}) {
  let query = supabase
    .from('place_suggestions')
    .select('*, profiles:submitted_by ( display_name )')
    .order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function setSuggestionStatus(id, status) {
  const { error } = await supabase.from('place_suggestions').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteSuggestion(id) {
  const { error } = await supabase.from('place_suggestions').delete().eq('id', id)
  if (error) throw error
}

// ---------- Bulk place import (Google Maps scrape → Excel → review → publish) ----------

// Expected Excel headers (case/space-insensitive): Name, Category,
// Neighborhood, Address, Keywords, Google Maps Link, Google Rating,
// Google Rating Count, Photo URL. Missing optional columns are fine.
const IMPORT_HEADER_ALIASES = {
  name: 'name',
  category: 'category',
  neighborhood: 'neighborhood',
  address: 'address',
  keywords: 'keywords',
  googlemapslink: 'google_maps_url',
  googlemapsurl: 'google_maps_url',
  googlerating: 'google_rating',
  rating: 'google_rating',
  googleratingcount: 'google_rating_count',
  ratingcount: 'google_rating_count',
  reviewcount: 'google_rating_count',
  photourl: 'photo_url',
  photo: 'photo_url',
  imageurl: 'photo_url',
}

function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Takes rows as parsed by SheetJS's sheet_to_json({ header: 1 }) — i.e. an
// array of arrays, first row is headers — and maps them into place_imports
// rows. Rows without a name are skipped.
export function mapImportSheetRows(sheetRows) {
  if (!sheetRows.length) return []
  const headers = sheetRows[0].map(normalizeHeader)
  const fieldForCol = headers.map((h) => IMPORT_HEADER_ALIASES[h] || null)

  return sheetRows.slice(1).map((row) => {
    const rec = {}
    fieldForCol.forEach((field, i) => {
      if (!field) return
      const raw = row[i]
      if (raw === undefined || raw === null || raw === '') return
      if (field === 'keywords') {
        rec.keywords = String(raw).split(',').map((k) => k.trim()).filter(Boolean)
      } else if (field === 'google_rating') {
        rec.google_rating = Number(raw) || null
      } else if (field === 'google_rating_count') {
        rec.google_rating_count = parseInt(raw, 10) || null
      } else {
        rec[field] = String(raw).trim()
      }
    })
    return rec
  }).filter((r) => r.name)
}

export async function stagePlaceImports(rows, { batchLabel, createdBy } = {}) {
  if (!rows.length) return []
  const payload = rows.map((r) => ({
    name: r.name,
    category: r.category || 'restaurant',
    neighborhood: r.neighborhood || null,
    address: r.address || null,
    keywords: r.keywords || [],
    google_maps_url: r.google_maps_url || null,
    google_rating: r.google_rating ?? null,
    google_rating_count: r.google_rating_count ?? null,
    photo_url: r.photo_url || null,
    batch_label: batchLabel || null,
    created_by: createdBy || null,
  }))
  const { data, error } = await supabase.from('place_imports').insert(payload).select()
  if (error) throw error
  return data ?? []
}

export async function fetchPlaceImports({ status = 'pending' } = {}) {
  let query = supabase.from('place_imports').select('*').order('created_at', { ascending: true })
  if (status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function updatePlaceImport(id, patch) {
  const { error } = await supabase.from('place_imports').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePlaceImport(id) {
  const { error } = await supabase.from('place_imports').delete().eq('id', id)
  if (error) throw error
}

async function rehostImportPhoto(photoUrl, accessToken) {
  const res = await fetch(functionUrl('import-place-photo'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ photoUrl }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Photo import failed')
  }
  const { url } = await res.json()
  return url
}

// Publishes one staged row: re-hosts its photo (if any), inserts the real
// place, marks the import row published. Throws with the row's error stored
// on failure so the review queue can show it inline and let the admin retry.
export async function publishPlaceImport(row, accessToken) {
  try {
    let coverImageUrl = row.hosted_photo_url || null
    if (!coverImageUrl && row.photo_url) {
      coverImageUrl = await rehostImportPhoto(row.photo_url, accessToken)
    }

    const place = await createPlace({
      name: row.name,
      category: row.category,
      neighborhood: row.neighborhood,
      address: row.address,
      keywords: row.keywords,
      google_maps_url: row.google_maps_url,
      cover_image_url: coverImageUrl,
    })

    if (row.google_rating != null || row.google_rating_count != null) {
      await supabase
        .from('places')
        .update({ google_rating: row.google_rating, google_rating_count: row.google_rating_count })
        .eq('id', place.id)
    }

    await supabase
      .from('place_imports')
      .update({ status: 'published', hosted_photo_url: coverImageUrl, error: null, published_at: new Date().toISOString() })
      .eq('id', row.id)

    return place
  } catch (err) {
    await supabase.from('place_imports').update({ error: err.message }).eq('id', row.id)
    throw err
  }
}

export async function skipPlaceImport(id) {
  const { error } = await supabase.from('place_imports').update({ status: 'skipped' }).eq('id', id)
  if (error) throw error
}
