import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { fetchSearchKeywords, createSearchKeyword, deleteSearchKeyword } from '../lib/adminApi'

// Keep in sync with Places/CategoryImages — the categories that actually
// exist on the site.
const CATEGORIES = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'cafeteria', label: 'Cafeteria' },
  { key: 'fast-food', label: 'Fast food' },
  { key: 'patisserie', label: 'Patisserie' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

export default function Keywords() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0].key)
  const [saving, setSaving] = useState(false)

  const [q, setQ] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    setLoading(true)
    fetchSearchKeywords()
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    const clean = keyword.trim()
    if (!clean) return
    setSaving(true)
    setError('')
    try {
      const row = await createSearchKeyword(clean, category)
      setRows((prev) => [...prev, row].sort((a, b) => a.category.localeCompare(b.category) || a.keyword.localeCompare(b.keyword)))
      setKeyword('')
    } catch (err) {
      // Unique index on (lower(keyword), category) — most common failure is a duplicate.
      setError(err.message.includes('duplicate') ? `"${clean}" is already mapped to ${CATEGORY_LABEL[category]}.` : err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      await deleteSearchKeyword(id)
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows
    const needle = q.trim().toLowerCase()
    return rows.filter(
      (r) => r.keyword.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle)
    )
  }, [rows, q])

  return (
    <AdminLayout title="Keywords">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Search keywords</h1>
          <p>
            Map a generic word to a category so the live search surfaces every place in that category —
            e.g. someone typing "burger" sees every Fast food place, "cake" sees every Patisserie, sorted
            most-reviewed first. This is on top of each place's own keywords (set in Places → Edit).
          </p>
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="kw-input">Keyword</label>
            <input
              id="kw-input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="burger"
              required
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="kw-category">Maps to category</label>
            <select id="kw-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary btn-small" type="submit" disabled={saving}>
            {saving ? 'Adding…' : '+ Add keyword'}
          </button>
        </form>
      </div>

      <div className="page-head">
        <div />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter keywords…"
          style={{ maxWidth: 240 }}
        />
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : filteredRows.length === 0 ? (
          <div className="empty-state">
            {rows.length === 0 ? 'No keywords yet — add the first one above.' : 'No keywords match that filter.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Category</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.keyword}</td>
                    <td>{CATEGORY_LABEL[r.category] || r.category}</td>
                    <td>
                      <button
                        className="btn-danger btn-small"
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                      >
                        {deletingId === r.id ? 'Removing…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
