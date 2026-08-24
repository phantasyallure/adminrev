// Decodes Google Plus Codes (aka Open Location Code) straight to lat/lng,
// entirely offline — no network call, no geocoding service involved.
//
// Why this exists: most of the addresses pulled in from Google Maps scrapes
// look like "M83X+6WG, Unnamed Road, Es Sénia, Algeria" instead of a real
// street address. That "M83X+6WG" is a Plus Code — and Nominatim (the free
// geocoder used as a fallback elsewhere in this file) has no idea what to
// do with it, since it's not a standard address string. It just fails
// silently, which is why so many imported places ended up with no
// coordinates at all despite having a perfectly good location encoded
// right there in the address.
//
// Plus Codes are a public, deterministic grid system (Apache-2.0,
// google/open-location-code) — given the code, you can compute the exact
// lat/lng with pure math, no lookup required. The only wrinkle: addresses
// almost always show the *short* form (missing the first 4-8 characters,
// e.g. "M83X+6WG" instead of the full "8FVC9G8F+..." form), which needs a
// rough reference point — anywhere within about 50km is plenty — to
// recover the full code. We use central Oran for that, since every place
// on this site is in/around Oran.
//
// This implementation is self-written from the published Open Location
// Code specification and cross-checked against Google's own documented
// example (recoverNearest('9G8F+6X', 47.4, 8.6) recovering the Zurich
// reference code '8FVC9G8F+6X') before being wired into the app.

const CODE_ALPHABET = '23456789CFGHJMPQRVWX'
const SEPARATOR = '+'
const SEPARATOR_POSITION = 8
const PADDING_CHAR = '0'
const ENCODING_BASE = CODE_ALPHABET.length
const LATITUDE_MAX = 90
const LONGITUDE_MAX = 180
const PAIR_CODE_LENGTH = 10
const GRID_COLUMNS = 4
const GRID_ROWS = 5
const GRID_CODE_LENGTH = 15 - PAIR_CODE_LENGTH
const LAT_INTEGER_MULTIPLIER = 8000 * 3125 // 25,000,000
const LNG_INTEGER_MULTIPLIER = 8000 * 3125

// Central Oran — used only as a rough anchor to expand short codes like
// "M83X+6WG" into their full form. Anywhere within ~50km of the real spot
// resolves correctly, and every place in this app is well within that.
const ORAN_REFERENCE = { lat: 35.6969, lng: -0.6331 }

function clipLatitude(lat) {
  return Math.max(-LATITUDE_MAX, Math.min(LATITUDE_MAX, lat))
}

function normalizeLongitude(lng) {
  let l = lng
  while (l < -LONGITUDE_MAX) l += 360
  while (l >= LONGITUDE_MAX) l -= 360
  return l
}

// Decodes a FULL code (e.g. "8FVC9G8F+6X") into its center lat/lng.
function decodeFull(code) {
  const clean = code.toUpperCase().replace(SEPARATOR, '').replace(new RegExp(`${PADDING_CHAR}+$`), '')

  let latVal = 0
  let lngVal = 0
  let latPlaceValue = LAT_INTEGER_MULTIPLIER * 20 * 20
  let lngPlaceValue = LNG_INTEGER_MULTIPLIER * 20 * 20

  let digit = 0
  const pairDigits = Math.min(clean.length, PAIR_CODE_LENGTH)
  while (digit < pairDigits) {
    latPlaceValue = Math.floor(latPlaceValue / ENCODING_BASE)
    lngPlaceValue = Math.floor(lngPlaceValue / ENCODING_BASE)
    latVal += CODE_ALPHABET.indexOf(clean[digit]) * latPlaceValue
    lngVal += CODE_ALPHABET.indexOf(clean[digit + 1]) * lngPlaceValue
    digit += 2
  }

  let latDenominator
  let lngDenominator
  if (clean.length > PAIR_CODE_LENGTH) {
    let rowPlaceValue = GRID_ROWS ** GRID_CODE_LENGTH
    let colPlaceValue = GRID_COLUMNS ** GRID_CODE_LENGTH
    let rowVal = 0
    let colVal = 0
    while (digit < clean.length) {
      rowPlaceValue = Math.floor(rowPlaceValue / GRID_ROWS)
      colPlaceValue = Math.floor(colPlaceValue / GRID_COLUMNS)
      const idx = CODE_ALPHABET.indexOf(clean[digit])
      rowVal += Math.floor(idx / GRID_COLUMNS) * rowPlaceValue
      colVal += (idx % GRID_COLUMNS) * colPlaceValue
      digit += 1
    }
    latVal = latVal * GRID_ROWS ** GRID_CODE_LENGTH + rowVal
    lngVal = lngVal * GRID_COLUMNS ** GRID_CODE_LENGTH + colVal
    latDenominator = LAT_INTEGER_MULTIPLIER * GRID_ROWS ** GRID_CODE_LENGTH
    lngDenominator = LNG_INTEGER_MULTIPLIER * GRID_COLUMNS ** GRID_CODE_LENGTH
  } else {
    latDenominator = LAT_INTEGER_MULTIPLIER
    lngDenominator = LNG_INTEGER_MULTIPLIER
  }

  return {
    lat: latVal / latDenominator - LATITUDE_MAX,
    lng: lngVal / lngDenominator - LONGITUDE_MAX,
  }
}

// Encodes just the leading `length` significant characters (2, 4, 6, or 8 —
// always within the pair section) of the code for a lat/lng. Used to
// rebuild the missing prefix of a short code.
function encodePairPrefix(lat, lng, length) {
  const shiftedLat = lat + LATITUDE_MAX
  const shiftedLng = lng + LONGITUDE_MAX
  let remainingLat = Math.floor(shiftedLat * LAT_INTEGER_MULTIPLIER)
  let remainingLng = Math.floor(shiftedLng * LNG_INTEGER_MULTIPLIER)

  let latPlaceValue = Math.floor((LAT_INTEGER_MULTIPLIER * 20 * 20) / ENCODING_BASE)
  let lngPlaceValue = Math.floor((LNG_INTEGER_MULTIPLIER * 20 * 20) / ENCODING_BASE)

  let code = ''
  for (let i = 0; i < length; i += 2) {
    const latDigit = Math.floor(remainingLat / latPlaceValue)
    const lngDigit = Math.floor(remainingLng / lngPlaceValue)
    remainingLat -= latDigit * latPlaceValue
    remainingLng -= lngDigit * lngPlaceValue
    code += CODE_ALPHABET[latDigit] + CODE_ALPHABET[lngDigit]
    latPlaceValue = Math.floor(latPlaceValue / ENCODING_BASE)
    lngPlaceValue = Math.floor(lngPlaceValue / ENCODING_BASE)
  }
  return code
}

// Recovers a short code (e.g. "M83X+6WG", missing its first 4 characters)
// to a full lat/lng, using a reference point to fill in the missing prefix.
function recoverNearest(shortCode, refLat, refLng) {
  const code = shortCode.toUpperCase()
  const lat = clipLatitude(refLat)
  const lng = normalizeLongitude(refLng)

  const paddingLength = SEPARATOR_POSITION - code.indexOf(SEPARATOR)
  const resolution = 20 ** (2 - paddingLength / 2)
  const halfResolution = resolution / 2

  const prefix = encodePairPrefix(lat, lng, paddingLength)
  const fullCode = prefix + code.replace(SEPARATOR, '')
  const fullCodeWithSeparator = `${fullCode.slice(0, SEPARATOR_POSITION)}${SEPARATOR}${fullCode.slice(SEPARATOR_POSITION)}`

  let { lat: latCenter, lng: lngCenter } = decodeFull(fullCodeWithSeparator)

  // If the recovered cell landed a whole `resolution` away from the
  // reference point, we picked the wrong neighbouring cell — nudge it
  // back. Only matters for finer-grained short codes; for the common
  // "XXXX+XXX" case (1° cells) a same-city reference never triggers this.
  if (lat + halfResolution < latCenter && latCenter - resolution >= -LATITUDE_MAX) {
    latCenter -= resolution
  } else if (lat - halfResolution > latCenter && latCenter + resolution <= LATITUDE_MAX) {
    latCenter += resolution
  }
  if (lng + halfResolution < lngCenter) {
    lngCenter -= resolution
  } else if (lng - halfResolution > lngCenter) {
    lngCenter += resolution
  }

  return { lat: latCenter, lng: lngCenter }
}

// A Plus Code's significant characters only ever use this alphabet, so a
// valid one looks like 2-8 of those chars, a '+', then 2-3 more.
const PLUS_CODE_PATTERN = new RegExp(`\\b([${CODE_ALPHABET}]{2,8}\\+[${CODE_ALPHABET}]{2,3})\\b`, 'i')

// Finds a Plus Code inside a free-text address (e.g. pulled straight out
// of a Google Maps scrape) and decodes it to { lat, lng } — or returns
// null if there's no Plus Code in there. `refLat`/`refLng` default to
// central Oran, since that's what every address here needs to expand a
// short code correctly.
export function decodePlusCodeFromText(text, refLat = ORAN_REFERENCE.lat, refLng = ORAN_REFERENCE.lng) {
  if (!text) return null
  const match = String(text).match(PLUS_CODE_PATTERN)
  if (!match) return null
  const code = match[1].toUpperCase()

  try {
    const beforeSeparator = code.indexOf(SEPARATOR)
    const result = beforeSeparator >= SEPARATOR_POSITION ? decodeFull(code) : recoverNearest(code, refLat, refLng)
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) return null
    return result
  } catch {
    return null
  }
}
