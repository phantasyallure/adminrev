import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchPlacePhotoSubmissions, setPhotoSubmissionStatus, deletePhotoSubmission } from '../lib/adminApi'

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

export default function PlacePhotos() {
  const { user } = useAdminAuth()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    setLoading(true)
    fetchPlacePhotoSubmissions({ status }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (submission, newStatus) => {
    setBusyId(submission.id)
    try {
      await setPhotoSubmissionStatus(submission, newStatus, user.id)
      load()
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    await deletePhotoSubmission(pendingDelete)
    setPendingDelete(null)
    load()
  }

  return (
    <AdminLayout title="Place photos">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Place photo submissions</h1>
          <p>
            Photos sent from the "Add a real photo" button on cards that are showing the category placeholder
            (no cover photo of their own yet). Approving here sets the photo as the place's live cover photo
            immediately — check it looks right first.
          </p>
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
                  <th>Submitted photo</th>
                  <th>Place</th>
                  <th>Current cover</th>
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
                      <img
                        src={r.photo_url}
                        alt=""
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                      />
                    </td>
                    <td>{r.places?.name || <span className="muted">Place deleted</span>}</td>
                    <td>
                      {r.places?.cover_image_url ? (
                        <img
                          src={r.places.cover_image_url}
                          alt=""
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                        />
                      ) : (
                        <span className="muted">Placeholder</span>
                      )}
                    </td>
                    <td>{r.profiles?.display_name || '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>
                      <span className={`badge-pill badge-${r.status === 'dismissed' ? 'rejected' : r.status}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.status === 'pending' && r.places && (
                          <button
                            className="btn-ghost btn-small"
                            disabled={busyId === r.id}
                            onClick={() => act(r, 'approved')}
                          >
                            {busyId === r.id ? 'Approving…' : 'Approve'}
                          </button>
                        )}
                        {r.status === 'pending' && (
                          <button
                            className="btn-ghost btn-small"
                            disabled={busyId === r.id}
                            onClick={() => act(r, 'dismissed')}
                          >
                            Dismiss
                          </button>
                        )}
                        <button className="btn-danger btn-small" onClick={() => setPendingDelete(r.id)}>
                          Delete
                        </button>
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
          title="Delete this photo submission?"
          message="This removes the request permanently. It doesn't affect the place's current cover photo. This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </AdminLayout>
  )
}
