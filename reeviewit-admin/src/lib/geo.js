// Turns a free-text address into { lat, lng } using OpenStreetMap's free
// Nominatim geocoder (no API key needed). Used as a fallback whenever a
// place's Google Maps link doesn't carry embedded coordinates — which is
// the normal case for the short "maps.app.goo.gl / goo.gl/maps" links
// Google Maps hands out when you tap "Share" on a phone. Those links only
// resolve to real coordinates after a redirect that a browser can't follow
// cross-origin, so without this fallback every place added with a shared
// short link would silently get lat = null / lng = null and then never
// show up for "Près de moi" on the live site.
//
// Best-effort only: this never throws. A bad/vague address, no network, or
// no match just resolves to null.
export async function geocodeAddress(address, { city = 'Oran, Algérie', signal } = {}) {
  const query = [address?.trim(), city].filter(Boolean).join(', ')
  if (!address?.trim()) return null
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const results = await res.json()
    const hit = results?.[0]
    if (!hit) return null
    const lat = parseFloat(hit.lat)
    const lng = parseFloat(hit.lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null
    return { lat, lng }
  } catch {
    // Network error, aborted request, CORS hiccup, etc. — swallow it.
    return null
  }
}
