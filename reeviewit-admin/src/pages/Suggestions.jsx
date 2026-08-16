import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { fetchPlaceSuggestions, setSuggestionStatus, deleteSuggestion } from '../lib/adminApi'

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

export default function Suggestions() {
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    setLoading(true)
    fetchPlaceSuggestions({ status }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id, newStatus) => {
    await setSuggestionStatus(id, newStatus)
    load()
  }

  const confirmDelete = async () => {
    await deleteSuggestion(pendingDelete)
    setPendingDelete(null)
    load()
  }

  return (
    <AdminLayout title="Suggestions">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Place suggestions</h1>
          <p>Requests from users who couldn't find a place in search, sent from the "Suggest a place" form on the site. Approving here doesn't add the listing — add it yourself from Places using the details (and photo, if there is one) shown below.</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${status === t.key ? ' active' : ''}`} onClick={() => setStatus(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">Nothing here.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Neighborhood</th>
                  <th>Address</th>
                  <th>Note</th>
                  <th>Submitted by</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.photo_url ? (
                        <img
                          src={r.photo_url}
                          alt=""
                          className="place-thumb"
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{r.name}</td>
                    <td>{r.category || <span className="muted">—</span>}</td>
                    <td>{r.neighborhood || '—'}</td>
                    <td>{r.address || '—'}</td>
                    <td style={{ maxWidth: 220 }}>{r.note || <span className="muted">—</span>}</td>
                    <td>{r.profiles?.display_name || '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td><span className={`badge-pill badge-${r.status === 'dismissed' ? 'rejected' : r.status}`}>{r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.status === 'pending' && (
                          <button className="btn-ghost btn-small" onClick={() => act(r.id, 'approved')}>Approve</button>
                        )}
                        {r.status === 'pending' && (
                          <button className="btn-ghost btn-small" onClick={() => act(r.id, 'dismissed')}>Dismiss</button>
                        )}
                        <button className="btn-danger btn-small" onClick={() => setPendingDelete(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this suggestion?"
          message="This removes the request permanently. This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </AdminLayout>
  )
}
