import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import ConfirmDialog from '../components/ConfirmDialog'
import PlaceFormModal from '../components/PlaceFormModal'
import { fetchPlaces, deletePlace, setPlaceFeaturedRank } from '../lib/adminApi'

// Same column shape as the bulk-import sheet, so an exported file can be
// re-edited and re-imported without reshaping it.
function exportPlacesToExcel(places) {
  const rows = places.map((p) => ({
    Name: p.name,
    Category: p.category || '',
    Neighborhood: p.neighborhood || '',
    Address: p.address || '',
    Keywords: (p.keywords || []).join(', '),
    'Google Maps Link': p.google_maps_url || '',
    'Google Rating': p.google_rating ?? '',
    'Google Rating Count': p.google_rating_count ?? '',
    'Photo URL': p.cover_image_url || '',
    Slug: p.slug || '',
    'Reeviewit Rating': p.score ?? '',
    'Reeviewit Review Count': p.reviewCount ?? 0,
    Owner: p.ownerName || '',
    Featured: p.featured_rank ?? '',
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Places')
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `reeviewit-places-${date}.xlsx`)
}

export default function Places() {
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, place = edit
  const [pendingDelete, setPendingDelete] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false)

  const load = () => {
    setLoading(true)
    fetchPlaces({ q }).then(setPlaces).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected(new Set()) }, [q])

  const allSelected = places.length > 0 && selected.size === places.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(places.map((p) => p.id)))
  }
  const toggleSelectOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirmDelete = async () => {
    await deletePlace(pendingDelete)
    setPendingDelete(null)
    load()
  }

  const confirmBulkDelete = async () => {
    setBulkBusy(true)
    for (const id of selected) {
      try {
        await deletePlace(id)
      } catch (err) {
        console.error(err)
      }
    }
    setBulkBusy(false)
    setPendingBulkDelete(false)
    setSelected(new Set())
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {selected.size > 0 && (
            <>
              <span className="muted">{selected.size} selected</span>
              <button
                className="btn-ghost btn-small"
                onClick={() => exportPlacesToExcel(places.filter((p) => selected.has(p.id)))}
              >
                Export selected
              </button>
              <button className="btn-danger btn-small" onClick={() => setPendingBulkDelete(true)} disabled={bulkBusy}>
                Delete selected ({selected.size})
              </button>
            </>
          )}
          <SearchInput value={q} onChange={setQ} placeholder="Search places…" />
          <button
            className="btn-ghost btn-small"
            onClick={() => exportPlacesToExcel(places)}
            disabled={loading || places.length === 0}
          >
            Export Excel
          </button>
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
                  <th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                    />
                  </th>
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
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelectOne(p.id)}
                      />
                    </td>
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

      {pendingBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selected.size} place${selected.size === 1 ? '' : 's'}?`}
          message="This removes these listings and their reviews from Reeviewit."
          confirmLabel="Delete"
          danger
          onConfirm={confirmBulkDelete}
          onCancel={() => setPendingBulkDelete(false)}
        />
      )}
    </AdminLayout>
  )
}
