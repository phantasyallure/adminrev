import { useEffect, useState } from 'react'
import {
  createPlace,
  updatePlace,
  uploadPlacePhoto,
  fetchOwnerForPlace,
  grantPlaceOwnership,
  revokePlaceOwnership,
  searchProfilesForOwnership,
} from '../lib/adminApi'
import { useAdminAuth } from '../context/AdminAuthContext'

const CATEGORIES = ['restaurant', 'cafeteria', 'fast-food', 'patisserie']
const CTA_LABELS = [
  { key: 'order', label: 'Order' },
  { key: 'menu', label: 'View menu' },
  { key: 'booking', label: 'Book a table' },
]

export default function PlaceFormModal({ place, onClose, onSaved }) {
  const isEdit = Boolean(place)
  const { user: adminUser, session } = useAdminAuth()
  const [form, setForm] = useState({
    name: place?.name || '',
    slug: place?.slug || '',
    category: place?.category || 'restaurant',
    neighborhood: place?.neighborhood || '',
    address: place?.address || '',
    price_range: place?.price_range || '',
    cover_image_url: place?.cover_image_url || '',
    keywords: (place?.keywords || []).join(', '),
    google_maps_url: place?.google_maps_url || '',
    cta_enabled: place?.cta_enabled || false,
    cta_label: place?.cta_label || 'order',
    cta_url: place?.cta_url || '',
    menu_enabled: place?.menu_enabled || false,
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Ownership — separate table, loaded/saved independently of the main form.
  const [owner, setOwner] = useState(null) // { id, user_id, profiles } | null
  const [ownerLoading, setOwnerLoading] = useState(isEdit)
  const [ownerQuery, setOwnerQuery] = useState('')
  const [ownerResults, setOwnerResults] = useState([])
  const [ownerBusy, setOwnerBusy] = useState(false)
  const [ownerError, setOwnerError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    fetchOwnerForPlace(place.id)
      .then(setOwner)
      .catch((err) => setOwnerError(err.message))
      .finally(() => setOwnerLoading(false))
  }, [isEdit, place?.id])

  useEffect(() => {
    if (!isEdit || ownerQuery.trim().length < 2) {
      setOwnerResults([])
      return
    }
    const t = setTimeout(() => {
      searchProfilesForOwnership(ownerQuery).then(setOwnerResults).catch(() => setOwnerResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [ownerQuery, isEdit])

  const handleGrantOwnership = async (profile) => {
    setOwnerBusy(true)
    setOwnerError('')
    try {
      await grantPlaceOwnership(place.id, profile.id, adminUser?.id)
      setOwner({ user_id: profile.id, profiles: profile })
      setOwnerQuery('')
      setOwnerResults([])
    } catch (err) {
      setOwnerError(err.message)
    } finally {
      setOwnerBusy(false)
    }
  }

  const handleRevokeOwnership = async () => {
    if (!window.confirm(`Remove ${owner?.profiles?.display_name || 'this owner'} from ${place.name}?`)) return
    setOwnerBusy(true)
    setOwnerError('')
    try {
      await revokePlaceOwnership(place.id)
      setOwner(null)
    } catch (err) {
      setOwnerError(err.message)
    } finally {
      setOwnerBusy(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadPlacePhoto(file)
      setForm((f) => ({ ...f, cover_image_url: url }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        price_range: form.price_range ? Number(form.price_range) : null,
        keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
      }
      if (isEdit) {
        await updatePlace(place.id, payload, session?.access_token)
      } else {
        await createPlace(payload, session?.access_token)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 18 }}>{isEdit ? 'Edit place' : 'Add a restaurant or cafeteria'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid">
            <div className="field">
              <label>Name</label>
              <input required value={form.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Neighborhood</label>
              <input value={form.neighborhood} onChange={set('neighborhood')} placeholder="Front de Mer…" />
            </div>
            <div className="field">
              <label>Price range (1–4)</label>
              <input type="number" min="1" max="4" value={form.price_range} onChange={set('price_range')} />
            </div>
          </div>

          <div className="field">
            <label>Address</label>
            <input value={form.address} onChange={set('address')} />
          </div>

          <div className="field">
            <label>Keywords (comma-separated — dishes, cuisine, vibe… used for search)</label>
            <input value={form.keywords} onChange={set('keywords')} placeholder="couscous, halal, breakfast, rooftop" />
          </div>

          <div className="field">
            <label>Google Maps link</label>
            <input
              value={form.google_maps_url}
              onChange={set('google_maps_url')}
              placeholder="Paste the share link from Google Maps"
            />
            <span className="muted">Open the place on Google Maps → Share → Copy link, then paste it here.</span>
          </div>

          <div className="field">
            <label>Cover photo</label>
            <input type="file" accept="image/*" onChange={handlePhoto} />
            {uploading && <span className="muted">Uploading…</span>}
            {form.cover_image_url && (
              <img src={form.cover_image_url} alt="" className="place-thumb" style={{ width: 80, height: 80, marginTop: 6 }} />
            )}
          </div>

          {isEdit && (
            <p className="muted">Rating is calculated automatically from approved reviews and can't be set manually.</p>
          )}

          <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <input type="checkbox" checked={form.cta_enabled} onChange={(e) => setForm((f) => ({ ...f, cta_enabled: e.target.checked }))} />
              Enable CTA button (paid feature — off by default)
            </label>
            {form.cta_enabled && (
              <div className="form-grid" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>Button</label>
                  <select value={form.cta_label} onChange={set('cta_label')}>
                    {CTA_LABELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Link (WhatsApp, delivery app, booking page…)</label>
                  <input value={form.cta_url} onChange={set('cta_url')} placeholder="https://…" />
                </div>
              </div>
            )}
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <input type="checkbox" checked={form.menu_enabled} onChange={(e) => setForm((f) => ({ ...f, menu_enabled: e.target.checked }))} />
              Enable menu (paid feature — the owner adds their own items once this is on)
            </label>
          </div>

          {isEdit && (
            <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <label style={{ fontWeight: 600 }}>Ownership</label>
              {ownerLoading ? (
                <p className="muted">Loading…</p>
              ) : owner ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <img
                    src={owner.profiles?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${owner.profiles?.display_name}`}
                    alt=""
                    style={{ width: 32, height: 32, borderRadius: '50%' }}
                  />
                  <span>{owner.profiles?.display_name}</span>
                  <button type="button" className="btn-danger btn-small" onClick={handleRevokeOwnership} disabled={ownerBusy}>
                    {ownerBusy ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <input
                    value={ownerQuery}
                    onChange={(e) => setOwnerQuery(e.target.value)}
                    placeholder="Search a user by name to grant ownership…"
                  />
                  {ownerResults.length > 0 && (
                    <div className="card" style={{ marginTop: 6, padding: 8 }}>
                      {ownerResults.map((p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <img
                              src={p.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${p.display_name}`}
                              alt=""
                              style={{ width: 24, height: 24, borderRadius: '50%' }}
                            />
                            {p.display_name}
                          </span>
                          <button type="button" className="btn-primary btn-small" onClick={() => handleGrantOwnership(p)} disabled={ownerBusy}>
                            Grant
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {ownerError && <p className="error-text">{ownerError}</p>}
              <span className="muted">
                Owners get a "Owner of {'{place}'}" badge, but only when replying to reviews on this exact place.
              </span>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn-ghost btn-small" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary btn-small" disabled={saving || uploading}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add place'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
