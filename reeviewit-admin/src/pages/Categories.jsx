import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import Icon from '../components/Icon'
import { fetchCategories, fetchCategoryStats, fetchCategoryImages, saveCategory, deleteCategory } from '../lib/adminApi'

const EMPTY = { key: '', label: '', emoji: '', sort_order: 0, is_visible: true }

export default function Categories() {
  const [rows, setRows] = useState([])
  const [builtin, setBuiltin] = useState(false)
  const [stats, setStats] = useState({})
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // { ...cat, isNew }
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { rows: cats, builtin: isBuiltin } = await fetchCategories()
      setRows(cats)
      setBuiltin(isBuiltin)
      const [st, imgs] = await Promise.all([
        fetchCategoryStats(cats.map((c) => c.key)),
        fetchCategoryImages().catch(() => []),
      ])
      setStats(st)
      setImages(Object.fromEntries(imgs.map((i) => [i.category, i.image_url])))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const key = editing.isNew ? slugify(editing.key || editing.label) : editing.key
      if (!key) throw new Error('Give the category a name.')
      await saveCategory({ ...editing, key }, { isNew: editing.isNew })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteCategory(deleteTarget.key)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err.message)
      setDeleteTarget(null)
    }
  }

  const totalPlaces = Object.values(stats).reduce((n, s) => n + s.places, 0)

  return (
    <AdminLayout title="Categories">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Categories</h1>
          <p>The place types shown on the site. Each one owns its places, keywords and homepage picture.</p>
        </div>
        {!builtin && (
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY, sort_order: rows.length + 1, isNew: true })}>
            <Icon name="plus" size={16} />&nbsp;New category
          </button>
        )}
      </div>

      {builtin && (
        <div className="notice">
          Showing the 4 built-in categories. Run <code>supabase/admin_overhaul.sql</code> in the Supabase SQL editor to
          make them editable and to add new ones.
        </div>
      )}
      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="cat-grid">
          {rows.map((c) => {
            const st = stats[c.key] || { places: 0, keywords: 0 }
            const share = totalPlaces ? Math.round((st.places / totalPlaces) * 100) : 0
            return (
              <div key={c.key} className={`cat-card${c.is_visible === false ? ' hidden-cat' : ''}`}>
                <div className="cat-cover" style={images[c.key] ? { backgroundImage: `url(${images[c.key]})` } : undefined}>
                  <span className="cat-emoji">{c.emoji || '📍'}</span>
                  {c.is_visible === false && <span className="badge-pill badge-pending cat-hidden">Hidden</span>}
                </div>
                <div className="cat-body">
                  <div className="cat-title">{c.label}</div>
                  <div className="muted" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{c.key}</div>
                  <div className="cat-stats">
                    <div><b>{st.places}</b><span>places</span></div>
                    <div><b>{st.keywords}</b><span>keywords</span></div>
                    <div><b>{share}%</b><span>of all</span></div>
                  </div>
                  <div className="visitor-bar-track"><div className="visitor-bar-fill" style={{ width: `${Math.max(share, 2)}%` }} /></div>
                  <div className="cat-actions">
                    <Link className="btn-ghost btn-small" to={`/places?category=${c.key}`}>View places</Link>
                    {!builtin && <button className="btn-ghost btn-small" onClick={() => setEditing({ ...c, isNew: false })}>Edit</button>}
                    {!builtin && <button className="btn-danger btn-small" onClick={() => setDeleteTarget(c)} disabled={st.places > 0} title={st.places > 0 ? 'Move its places first' : ''}>Delete</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="muted" style={{ marginTop: 16 }}>
        Tip: change a category's homepage picture in <Link to="/category-images" style={{ textDecoration: 'underline' }}>Category images</Link>, and its search words in <Link to="/keywords" style={{ textDecoration: 'underline' }}>Keywords</Link>.
      </p>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>{editing.isNew ? 'New category' : `Edit ${editing.label}`}</h3>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Name</label>
                  <input required value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Glacier" />
                </div>
                <div className="field">
                  <label>Emoji</label>
                  <input value={editing.emoji || ''} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} placeholder="🍦" maxLength={4} />
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Key (used in the database)</label>
                  <input
                    value={editing.isNew ? (editing.key || slugify(editing.label)) : editing.key}
                    disabled={!editing.isNew}
                    onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                    placeholder="glacier"
                  />
                </div>
                <div className="field">
                  <label>Order</label>
                  <input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} />
                </div>
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={editing.is_visible !== false} onChange={(e) => setEditing({ ...editing, is_visible: e.target.checked })} />
                Visible on the site
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn-ghost btn-small" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn-primary btn-small" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.label}?`}
          message="The category disappears from the admin lists. Its keywords and homepage picture are not removed automatically."
          confirmLabel="Delete category"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </AdminLayout>
  )
}
