import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchBusinessClaims, updateBusinessClaim, approveBusinessClaim, deleteBusinessClaim } from '../lib/adminApi'

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

export default function BusinessClaims() {
  const { user: adminUser } = useAdminAuth()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notesDraft, setNotesDraft] = useState({}) // id -> text, only while editing
  const [approveError, setApproveError] = useState('')

  const load = () => {
    setLoading(true)
    fetchBusinessClaims({ status }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const setClaimStatus = async (id, newStatus) => {
    await updateBusinessClaim(id, { status: newStatus })
    load()
  }

  const approve = async (claim) => {
    setApproveError('')
    try {
      await approveBusinessClaim(claim, adminUser?.id)
      load()
    } catch (err) {
      setApproveError(`Couldn't grant ownership for ${claim.first_name} ${claim.last_name}: ${err.message}`)
    }
  }

  const saveNotes = async (id) => {
    await updateBusinessClaim(id, { admin_notes: notesDraft[id] ?? '' })
    setNotesDraft((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    load()
  }

  const confirmDelete = async () => {
    await deleteBusinessClaim(pendingDelete)
    setPendingDelete(null)
    load()
  }

  return (
    <AdminLayout title="Business claims">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Business claims</h1>
          <p>
            People who tapped "Claim this business" on a place page. Reach out using the phone number below —
            once you've verified them and taken payment, hit "Approve" to grant them real ownership of the place.
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
                  <th>Business</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Notes</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.places?.slug ? (
                        <Link to={`/places?q=${encodeURIComponent(r.places.name)}`}>{r.places.name}</Link>
                      ) : (
                        r.places?.name || <span className="muted">—</span>
                      )}
                    </td>
                    <td>{r.first_name} {r.last_name}</td>
                    <td><a href={`tel:${r.phone}`}>{r.phone}</a></td>
                    <td style={{ minWidth: 200 }}>
                      <textarea
                        rows={2}
                        style={{ width: '100%', fontSize: 13 }}
                        placeholder="Internal notes…"
                        value={notesDraft[r.id] ?? r.admin_notes ?? ''}
                        onChange={(e) => setNotesDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        onBlur={() => { if (notesDraft[r.id] !== undefined) saveNotes(r.id) }}
                      />
                    </td>
                    <td>{formatDate(r.created_at)}</td>
                    <td><span className={`badge-pill badge-${r.status === 'rejected' ? 'rejected' : r.status}`}>{r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {r.status === 'pending' && (
                          <button className="btn-ghost btn-small" onClick={() => setClaimStatus(r.id, 'contacted')}>Mark contacted</button>
                        )}
                        {r.status !== 'approved' && (
                          <button className="btn-ghost btn-small" onClick={() => approve(r)}>
                            Approve (grants ownership)
                          </button>
                        )}
                        {r.status !== 'rejected' && (
                          <button className="btn-ghost btn-small" onClick={() => setClaimStatus(r.id, 'rejected')}>Reject</button>
                        )}
                        <button className="btn-danger btn-small" onClick={() => setPendingDelete(r.id)}>Delete</button>
                      </div>
                      {!r.user_id && r.status !== 'approved' && (
                        <p className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                          No linked account — approving will only mark this claim, not grant ownership.
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approveError && <p className="error-text" style={{ marginTop: 10 }}>{approveError}</p>}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this claim?"
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
