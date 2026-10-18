// The site only has four categories: restaurant, cafeteria, fast-food, patisserie.
// Spreadsheets scraped from Google Maps use Google's wording instead
// ("Pizza restaurant", "Coffee shop", "Pastry shop"…), so imports map them onto
// the four site categories. Keep in step with the website's categoryPlaceholder.js
// and supabase/normalize_place_categories.sql.

export const SITE_CATEGORIES = ['restaurant', 'cafeteria', 'fast-food', 'patisserie']

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

export function canonicalCategory(raw) {
  const c = norm(raw)
  if (SITE_CATEGORIES.includes(c)) return c
  if (/pastr|bakery|patisser|cake|dessert|candy|confection|chocolat|sweet|sundae|ice cream|creperie|crepe|donut|gateau|boulang/.test(c)) return 'patisserie'
  if (/fast food|burger|sandwich|snack|taco|takeaway|take away|kebab|shawarma|doner|chicken shop|hot dog|fried chicken|panini/.test(c)) return 'fast-food'
  if (/\bcafe\b|cafeteria|coffee|tea ?house|teahouse|tea room|espresso|juice|salon de the/.test(c)) return 'cafeteria'
  return 'restaurant'
}
