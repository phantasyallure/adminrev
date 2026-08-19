import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import ConfirmDialog from '../components/ConfirmDialog'
import PlaceFormModal from '../components/PlaceFormModal'
import { fetchPlaces, deletePlace, setPlaceFeaturedRank } from '../lib/adminApi'

export default function Places() {
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, place = edit
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    setLoading(true)
    fetchPlaces({ q }).then(setPlaces).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    await deletePlace(pendingDelete)
    setPendingDelete(null)
    load()
  }

  const handleFeaturedChange = async (place, value) => {
    const rank = value === '' ? null : Number(value)
    setPlaces((prev) => prev.map((p) => (p.id === place.id ? { ...p, featured_rank: rank } : p)))
    try {
      await setPlaceFeaturedRank(place.id, rank)
    } catch (err) {
      console.error(err)
      load()
    }
  }

  return (
    <AdminLayout title="Places">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Restaurants & cafeterias</h1>
          <p>Add listings and keywords so people can search by dish, cuisine, or vibe.</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Give a place a "Featured" number to put it in the homepage carousel (1 shows first). Leave it blank to keep it off the homepage.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Search places…" />
          <button className="btn-primary btn-small" onClick={() => setEditing({})}>+ Add place</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : places.length === 0 ? (
          <div className="empty-state">No places yet — add the first one.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Keywords</th>
                  <th>Owner</th>
                  <th>Rating</th>
                  <th>Featured</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {places.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <img src={p.cover_image_url || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + p.id} alt="" className="place-thumb" />
                    </td>
                    <td>
                      {p.name} {p.google_maps_url && <span title="Has a map link">📍</span>}
                      <div className="muted">{p.neighborhood}</div>
                    </td>
                    <td>{p.category}</td>
                    <td style={{ maxWidth: 220 }}>{(p.keywords || []).join(', ') || <span className="muted">—</span>}</td>
                    <td>
                      {p.ownerName ? (
                        <span className="badge-pill badge-approved">{p.ownerName}</span>
                      ) : (
                        <span className="muted">Unclaimed</span>
                      )}
                    </td>
                    <td>
                      {p.score ? (
                        `${Number(p.score).toFixed(1)} ★ (${p.reviewCount})`
                      ) : p.google_rating ? (
                        <span className="muted" title="From Google Maps — not yet a real Reeviewit rating">
                          {Number(p.google_rating).toFixed(1)} ★ (Google)
                        </span>
                      ) : (
                        <span className="muted">No reviews</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        placeholder="—"
                        value={p.featured_rank ?? ''}
                        onChange={(e) => handleFeaturedChange(p, e.target.value)}
                        style={{ width: 56 }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost btn-small" onClick={() => setEditing(p)}>Edit</button>
                        <button className="btn-danger btn-small" onClick={() => setPendingDelete(p.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <PlaceFormModal
          place={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this place?"
          message="This removes the listing and its reviews from Reeviewit."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </AdminLayout>
  )
}
