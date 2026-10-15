import { useState } from 'react'
import { createPlace, updatePlace, uploadPlacePhoto } from '../lib/adminApi'

const CATEGORIES = ['restaurant', 'cafeteria', 'fast-food', 'patisserie']

export default function PlaceFormModal({ place, onClose, onSaved }) {
  const isEdit = Boolean(place)
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
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        await updatePlace(place.id, payload)
      } else {
        await createPlace(payload)
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
