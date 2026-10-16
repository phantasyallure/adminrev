// Finds likely duplicate places. Pure functions, no database access.
//
// Two places are compared with these rules (level 3 = sure, 2 = likely, 1 = possible):
//   3  same Google Maps place ID
//   3  same name and within 150 m of each other (or same name + same address)
//   2  same name, same neighbourhood, but no coordinates to compare
//   2  same name once generic words are dropped ("Restaurant Santorino" = "Santorino")
//      and within 300 m
//   1  within 40 m of each other with a very similar name (typos, spelling variants)
// Same name far apart is ignored: that is normally a chain with several branches.
// If both places have a Google place ID and the IDs differ, the pair is capped at level 1.

const GENERIC = new Set([
  'restaurant', 'resto', 'cafe', 'coffee', 'pizzeria', 'pizza', 'snack', 'fast', 'food', 'brasserie',
  'salon', 'de', 'the', 'le', 'la', 'les', 'el', 'al', 'l', 'chez', 'et', 'and', 'oran', 'dz',
  'مطعم', 'مقهى', 'كافي', 'ال',
])

export function tokens(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function googlePlaceId(url) {
  if (!url) return null
  const m = String(url).match(/place_id[:=]([\w-]+)/i) || String(url).match(/[?&]cid=(\d+)/i)
  return m ? m[1] : null
}

export function distanceMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function similarity(a, b) {
  if (a === b) return 1
  if (!a || !b) return 0
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return 1 - prev[n] / Math.max(m, n)
}

function prepare(p) {
  const toks = tokens(p.name)
  const fullKey = toks.join('')
  const core = toks.filter((t) => !GENERIC.has(t)).join('')
  const lat = p.lat == null ? null : Number(p.lat)
  const lng = p.lng == null ? null : Number(p.lng)
  const addrKey = tokens(p.address).join('')
  return {
    p,
    fullKey,
    coreKey: core || fullKey,
    pid: googlePlaceId(p.google_maps_url),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    hood: tokens(p.neighborhood).join(''),
    addrKey: addrKey.length >= 12 ? addrKey : '',
  }
}

function comparePair(a, b) {
  let dist = null
  if (a.lat != null && b.lat != null) {
    dist = Math.abs(a.lat - b.lat) > 0.01 ? Infinity : distanceMeters(a.lat, a.lng, b.lat, b.lng)
  }
  const m = (d) => `${Math.round(d)} m`
  let level = 0
  let reason = ''

  if (a.pid && a.pid === b.pid) {
    level = 3; reason = 'Same Google Maps place ID'
  } else if (a.fullKey && a.fullKey === b.fullKey) {
    if (dist != null && dist <= 150) { level = 3; reason = `Same name, ${m(dist)} apart` }
    else if (a.addrKey && a.addrKey === b.addrKey) { level = 3; reason = 'Same name and address' }
    else if (dist == null && a.hood && a.hood === b.hood) { level = 2; reason = 'Same name and neighbourhood (no coordinates)' }
  } else if (a.coreKey.length >= 3 && a.coreKey === b.coreKey) {
    if (dist != null && dist <= 300) { level = 2; reason = `Similar name, ${m(dist)} apart` }
    else if (a.addrKey && a.addrKey === b.addrKey) { level = 2; reason = 'Similar name, same address' }
  } else if (dist != null && dist <= 40 && similarity(a.fullKey, b.fullKey) >= 0.75) {
    level = 1; reason = `Very close (${m(dist)}) with a similar name`
  }

  if (level > 1 && a.pid && b.pid && a.pid !== b.pid) {
    level = 1; reason += ' — but different Google place IDs'
  }
  return { level, reason }
}

// Picks the copy worth keeping: most reviews, then has a photo, coordinates, Google data, oldest.
function keeperScore(p, reviewCounts) {
  return (
    (reviewCounts[p.id] || 0) * 1000 +
    (p.cover_image_url ? 100 : 0) +
    (p.lat != null && p.lng != null ? 10 : 0) +
    (p.google_rating_count ? 1 : 0)
  )
}

// Returns [{ key, level, reasons, members, keeperId }], most certain first.
export function findDuplicateGroups(places, reviewCounts = {}, minLevel = 2) {
  const items = places.map(prepare)
  const parent = items.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const edges = []

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const { level, reason } = comparePair(items[i], items[j])
      if (level >= minLevel) {
        edges.push({ i, j, level, reason })
        parent[find(i)] = find(j)
      }
    }
  }

  const byRoot = new Map()
  for (const e of edges) {
    const r = find(e.i)
    if (!byRoot.has(r)) byRoot.set(r, [])
    byRoot.get(r).push(e)
  }

  const groups = []
  for (const [, es] of byRoot) {
    const idx = new Set()
    es.forEach((e) => { idx.add(e.i); idx.add(e.j) })
    const members = [...idx].map((i) => items[i].p).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    const keeper = [...members].sort((a, b) => {
      const d = keeperScore(b, reviewCounts) - keeperScore(a, reviewCounts)
      return d !== 0 ? d : String(a.created_at).localeCompare(String(b.created_at))
    })[0]
    const reasons = [...new Set(es.map((e) => e.reason.replace(/\d+ m/g, 'N m')))].slice(0, 3)
    const exact = [...new Set(es.map((e) => e.reason))].slice(0, 3)
    groups.push({
      key: members.map((m) => m.id).sort().join('|'),
      level: Math.min(...es.map((e) => e.level)),
      reasons: exact.length ? exact : reasons,
      members,
      keeperId: keeper.id,
    })
  }
  return groups.sort((a, b) => b.level - a.level || b.members.length - a.members.length)
}
