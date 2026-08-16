import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { fetchCategoryImages, uploadCategoryImage } from '../lib/adminApi'

// Keep this in sync with the categories used across the site (Places form,
// Feed filters, CategoryStrip on the homepage).
const CATEGORIES = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'cafeteria', label: 'Cafeteria' },
  { key: 'fast-food', label: 'Fast food' },
  { key: 'patisserie', label: 'Patisserie' },
]

export default function CategoryImages() {
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [uploadingKey, setUploadingKey] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    fetchCategoryImages()
      .then((rows) => setImages(Object.fromEntries(rows.map((r) => [r.category, r.image_url]))))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleFile = async (category, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingKey(category)
    setError('')
    try {
      const row = await uploadCategoryImage(category, file)
      setImages((prev) => ({ ...prev, [category]: row.image_url }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingKey(null)
      e.target.value = ''
    }
  }

  return (
    <AdminLayout title="Category images">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Homepage category images</h1>
          <p>
            Photo shown on each category tile on the homepage (below the hero, above the featured places).
            Upload one per category — it replaces whatever was there before. Photos are compressed automatically.
          </p>
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
            {CATEGORIES.map(({ key, label }) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 3',
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: 'var(--bg-soft, #f4f4f4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--line, #e4e4e4)',
                  }}
                >
                  {images[key] ? (
                    <img src={images[key]} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span className="muted">No image yet</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{label}</strong>
                  <label className="btn-ghost btn-small" style={{ cursor: 'pointer' }}>
                    {uploadingKey === key ? 'Uploading…' : images[key] ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={uploadingKey === key}
                      onChange={(e) => handleFile(key, e)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
