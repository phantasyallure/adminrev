import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchReviews, setReviewStatus, deleteReview } from '../lib/adminApi'

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

function average(r) {
  const vals = ['food', 'service', 'cleanliness', 'price', 'vibe']
    .map((k) => r[`rating_${k}`])
    .filter((v) => v != null)
  if (!vals.length) return '—'
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
}

export default function Reviews() {
  const { user, hasPermission } = useAdminAuth()
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    setLoading(true)
    fetchReviews({ status, q }).then(setReviews).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id, newStatus) => {
    await setReviewStatus(id, newStatus, user.id)
    load()
  }

  const confirmDelete = async () => {
    await deleteReview(pendingDelete)
    setPendingDelete(null)
    load()
  }

  return (
    <AdminLayout title="Reviews">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Reviews</h1>
          <p>Approve, reject, or remove reviews before they show on the site.</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search review text…" />
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
        ) : reviews.length === 0 ? (
          <div className="empty-state">Nothing here.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Author</th>
                  <th>Rating</th>
                  <th>Review</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>{r.places?.name || '—'}</td>
                    <td>{r.profiles?.display_name || 'Unknown'}</td>
                    <td>{average(r)} ★</td>
                    <td style={{ maxWidth: 320 }}>{r.body || <span className="muted">No text</span>}</td>
                    <td><span className={`badge-pill badge-${r.status}`}>{r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasPermission('can_approve_reviews') && r.status !== 'approved' && (
                          <button className="btn-ghost btn-small" onClick={() => act(r.id, 'approved')}>Approve</button>
                        )}
                        {hasPermission('can_approve_reviews') && r.status !== 'rejected' && (
                          <button className="btn-ghost btn-small" onClick={() => act(r.id, 'rejected')}>Reject</button>
                        )}
                        {hasPermission('can_delete_reviews') && (
                          <button className="btn-danger btn-small" onClick={() => setPendingDelete(r.id)}>Delete</button>
                        )}
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
          title="Delete this review?"
          message="This permanently removes the review from Reeviewit. This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </AdminLayout>
  )
}
