import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchProductPosts, setProductPostStatus, deleteProductPost } from '../lib/adminApi'

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

export default function ProductPosts() {
  const { user, hasPermission } = useAdminAuth()
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState(null)

  const load = () => {
    setLoading(true)
    fetchProductPosts({ status, q }).then(setPosts).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (post, newStatus) => {
    await setProductPostStatus(post, newStatus, user.id)
    load()
  }

  const confirmDelete = async () => {
    await deleteProductPost(pendingDelete)
    setPendingDelete(null)
    load()
  }

  return (
    <AdminLayout title="Products">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Products</h1>
          <p>Approve, reject, or remove product posts before they show on the site.</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search caption or keyword…" />
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
        ) : posts.length === 0 ? (
          <div className="empty-state">Nothing here.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Author</th>
                  <th>Place</th>
                  <th>Caption</th>
                  <th>Keywords</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <a href={p.image_url} target="_blank" rel="noreferrer">
                        <img
                          src={p.image_url}
                          alt=""
                          style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                        />
                      </a>
                    </td>
                    <td>{p.profiles?.display_name || 'Unknown'}</td>
                    <td>{p.places?.name || '—'}</td>
                    <td style={{ maxWidth: 260 }}>{p.caption || <span className="muted">No caption</span>}</td>
                    <td style={{ maxWidth: 180 }}>{p.keywords?.length ? p.keywords.join(', ') : '—'}</td>
                    <td><span className={`badge-pill badge-${p.status}`}>{p.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasPermission('can_approve_reviews') && p.status !== 'approved' && (
                          <button className="btn-ghost btn-small" onClick={() => act(p, 'approved')}>Approve</button>
                        )}
                        {hasPermission('can_approve_reviews') && p.status !== 'rejected' && (
                          <button className="btn-ghost btn-small" onClick={() => act(p, 'rejected')}>Reject</button>
                        )}
                        {hasPermission('can_delete_reviews') && (
                          <button className="btn-danger btn-small" onClick={() => setPendingDelete(p.id)}>Delete</button>
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
          title="Delete this product post?"
          message="This permanently removes the post (and its comments) from Reeviewit. This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </AdminLayout>
  )
}
