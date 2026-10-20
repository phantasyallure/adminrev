import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import Icon from '../components/Icon'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchUsers, setUserBanned, softDeleteUser, hardDeleteUser } from '../lib/adminApi'

const timeAgo = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function Users() {
  const { hasPermission, session } = useAdminAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all') // all | active | banned
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    fetchUsers({ q }).then(setUsers).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    all: users.length,
    active: users.filter((u) => !u.is_banned).length,
    banned: users.filter((u) => u.is_banned).length,
  }), [users])

  const shown = users.filter((u) => filter === 'all' || (filter === 'banned' ? u.is_banned : !u.is_banned))

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleBan = (u) => (u.is_banned ? run(() => setUserBanned(u.id, false)) : setBanTarget(u))

  const confirmBan = () =>
    run(async () => {
      await setUserBanned(banTarget.id, true, banReason)
      setBanTarget(null)
      setBanReason('')
    })

  // Permanent delete removes the login itself (edge function). If that
  // function isn't deployed, fall back to anonymizing so the admin is never stuck.
  const confirmDelete = (permanent) =>
    run(async () => {
      if (permanent) {
        try {
          await hardDeleteUser(deleteTarget.id, session?.access_token)
        } catch (err) {
          await softDeleteUser(deleteTarget.id)
          setError(`Permanent delete unavailable (${err.message}) — the account was anonymized and disabled instead.`)
        }
      } else {
        await softDeleteUser(deleteTarget.id)
      }
      setDeleteTarget(null)
    })

  return (
    <AdminLayout title="Users">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Users</h1>
          <p>Ban, unban or delete accounts. Award badges from the Badges page.</p>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search users…" />
      </div>

      <div className="tabs">
        {[['all', 'All'], ['active', 'Active'], ['banned', 'Banned']].map(([key, label]) => (
          <button key={key} className={`tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
            {label} <span style={{ opacity: 0.65 }}>· {counts[key]}</span>
          </button>
        ))}
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : shown.length === 0 ? (
          <div className="empty-state">No users found.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th><th>Name</th><th>Joined</th><th>Reviews</th><th>Badges</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className={u.is_banned ? 'row-banned' : ''}>
                    <td>
                      <img className="avatar-thumb" style={{ borderRadius: '50%' }} src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.display_name}`} alt="" />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                      {u.is_banned && u.banned_reason && <div className="muted">Reason: {u.banned_reason}</div>}
                    </td>
                    <td className="muted">{u.created_at ? timeAgo(u.created_at) : '—'}</td>
                    <td>{u.reviewCount}</td>
                    <td>
                      {u.badges.length === 0 ? <span className="muted">—</span> : u.badges.map((b) => (
                        b.icon_url
                          ? <img key={b.id} src={b.icon_url} alt={b.name} title={b.name} style={{ width: 20, height: 20, marginRight: 4 }} />
                          : <span key={b.id} title={b.name} style={{ marginRight: 4 }}>{b.icon}</span>
                      ))}
                    </td>
                    <td><span className={`badge-pill ${u.is_banned ? 'badge-banned' : 'badge-active'}`}>{u.is_banned ? 'Banned' : 'Active'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {hasPermission('can_send_notifications') && (
                          <button className="btn-ghost btn-small" title="Send a notification" onClick={() => navigate(`/notifications?user=${u.id}&name=${encodeURIComponent(u.display_name)}`)}>
                            <Icon name="bell" size={14} />
                          </button>
                        )}
                        {hasPermission('can_ban_users') && (
                          <button className="btn-ghost btn-small" disabled={busy} onClick={() => toggleBan(u)}>
                            <Icon name="ban" size={14} />&nbsp;{u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                        )}
                        {hasPermission('can_delete_users') && (
                          <button className="btn-danger btn-small" disabled={busy} onClick={() => setDeleteTarget(u)}>
                            <Icon name="trash" size={14} />&nbsp;Delete
                          </button>
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
              <button className="btn-danger" disabled={busy} onClick={confirmBan}>Ban user</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 10 }}>Delete {deleteTarget.display_name}?</h3>
            <p style={{ marginBottom: 18 }}>Choose how to remove this account.</p>
            <div className="choice-list">
              <button className="choice" disabled={busy} onClick={() => confirmDelete(true)}>
                <b>Delete permanently</b>
                <span>Removes the login and profile for good. This cannot be undone.</span>
              </button>
              <button className="choice" disabled={busy} onClick={() => confirmDelete(false)}>
                <b>Anonymize &amp; disable</b>
                <span>Keeps their reviews as "Deleted user" and blocks the account.</span>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-ghost btn-small" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
