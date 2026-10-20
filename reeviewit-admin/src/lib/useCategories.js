import { useEffect, useState } from 'react'
import { fetchCategories } from './adminApi'

// Categories for dropdowns/filters. Starts with the built-ins so forms
// render instantly, then swaps in the live list from the database.
const FALLBACK = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'cafeteria', label: 'Cafeteria' },
  { key: 'fast-food', label: 'Fast food' },
  { key: 'patisserie', label: 'Patisserie' },
]

export function useCategories() {
  const [categories, setCategories] = useState(FALLBACK)
  useEffect(() => {
    fetchCategories().then(({ rows }) => setCategories(rows)).catch(() => {})
  }, [])
  return categories
}
