import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchUsers, setUserBanned, softDeleteUser } from '../lib/adminApi'

export default function Users() {
  const { hasPermission } = useAdminAuth()
  const [q, setQ] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = () => {
    setLoading(true)
    fetchUsers({ q }).then(setUsers).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBan = async (u) => {
    if (u.is_banned) {
      await setUserBanned(u.id, false)
      load()
    } else {
      setBanTarget(u)
    }
  }

  const confirmBan = async () => {
    await setUserBanned(banTarget.id, true, banReason)
    setBanTarget(null)
    setBanReason('')
    load()
  }

  const confirmDelete = async () => {
    await softDeleteUser(deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  return (
    <AdminLayout title="Users">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Users</h1>
          <p>Ban or remove accounts. Award badges from the Badges page.</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search users…" />
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : users.length === 0 ? (
          <div className="empty-state">No users found.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Reviews</th>
                  <th>Badges</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <img className="avatar-thumb" style={{ borderRadius: '50%' }} src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.display_name}`} alt="" />
                    </td>
                    <td>{u.display_name}</td>
                    <td>{u.reviewCount}</td>
                    <td>
                      {u.badges.length === 0 ? <span className="muted">—</span> : u.badges.map((b) => (
                        b.icon_url ? (
                          <img key={b.id} src={b.icon_url} alt={b.name} title={b.name} style={{ width: 20, height: 20, marginRight: 4 }} />
                        ) : (
                          <span key={b.id} title={b.name} style={{ marginRight: 4 }}>{b.icon}</span>
                        )
                      ))}
                    </td>
                    <td><span className={`badge-pill ${u.is_banned ? 'badge-banned' : 'badge-active'}`}>{u.is_banned ? 'Banned' : 'Active'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {hasPermission('can_ban_users') && (
                          <button className="btn-ghost btn-small" onClick={() => toggleBan(u)}>
                            {u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                        )}
                        {hasPermission('can_delete_users') && (
                          <button className="btn-danger btn-small" onClick={() => setDeleteTarget(u)}>Delete</button>
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

      {banTarget && (
        <div className="modal-backdrop" onClick={() => setBanTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>Ban {banTarget.display_name}?</h3>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Reason (optional, internal only)</label>
              <textarea rows={3} value={banReason} onChange={(e) => setBanReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost btn-small" onClick={() => setBanTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmBan}>Ban user</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.display_name}?`}
          message="This anonymizes their profile and reviews stay attributed to 'Deleted user'. Their login is disabled but not permanently removed unless the delete-user function is deployed."
          confirmLabel="Delete user"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </AdminLayout>
  )
}
