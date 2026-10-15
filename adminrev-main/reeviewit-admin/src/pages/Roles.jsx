import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { PERMISSIONS, useAdminAuth } from '../context/AdminAuthContext'
import { fetchAdmins, createStaffAdmin, removeAdmin } from '../lib/adminApi'

const PRESETS = {
  Moderator: { can_approve_reviews: true, can_delete_reviews: true },
  'Content Manager': { can_manage_places: true },
  'Community Manager': { can_ban_users: true, can_award_badges: true },
  Owner: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])),
}

function emptyPerms() {
  return Object.fromEntries(PERMISSIONS.map((p) => [p.key, false]))
}

function randomPassword() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 14)
}

export default function Roles() {
  const { session } = useAdminAuth()
  const [admins, setAdmins] = useState([])
  const [removeTarget, setRemoveTarget] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(randomPassword())
  const [roleLabel, setRoleLabel] = useState('Moderator')
  const [perms, setPerms] = useState(PRESETS.Moderator)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = () => fetchAdmins().then(setAdmins).catch(console.error)
  useEffect(load, [])

  const applyPreset = (label) => {
    setRoleLabel(label)
    setPerms({ ...emptyPerms(), ...(PRESETS[label] || {}) })
  }

  const togglePerm = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }))

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await createStaffAdmin({ email, password, roleLabel, permissions: perms }, session.access_token)
      setSuccess(`Account created. Share these credentials with them directly — email: ${email}, password: ${password}`)
      setEmail('')
      setPassword(randomPassword())
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    await removeAdmin(removeTarget.user_id)
    setRemoveTarget(null)
    load()
  }

  return (
    <AdminLayout title="Roles">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Admin roles</h1>
          <p>Create standalone admin logins — separate from reviewer accounts — and decide what each can do.</p>
        </div>
      </div>

     <div className="two-col">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Current admins</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Role</th><th>Permissions</th><th></th></tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.user_id}>
                    <td>{a.profiles?.display_name || a.user_id}</td>
                    <td>{a.role_label}</td>
                    <td style={{ maxWidth: 260, fontSize: 12 }}>
                      {PERMISSIONS.filter((p) => a[p.key]).map((p) => p.label).join(', ') || '—'}
                    </td>
                    <td>
                      <button className="btn-danger btn-small" onClick={() => setRemoveTarget(a)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr><td colSpan={4} className="muted">No admins yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Create an admin account</h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            This creates a brand-new login just for this panel — no email confirmation, and no connection
            to any reviewer or Google account on the main site.
          </p>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="moderator@yourteam.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn-ghost btn-small" onClick={() => setPassword(randomPassword())}>Generate</button>
              </div>
              <span className="muted">Give this to them yourself — there's no invite email.</span>
            </div>
            <div className="field">
              <label>Role label</label>
              <select value={roleLabel} onChange={(e) => applyPreset(e.target.value)}>
                {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div>
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="checkbox-row">
                  <input type="checkbox" checked={Boolean(perms[p.key])} onChange={() => togglePerm(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
            {error && <p className="error-text">{error}</p>}
            {success && <p className="muted" style={{ color: 'var(--ok)' }}>{success}</p>}
            <button className="btn-primary btn-small" type="submit" disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>
      </div>

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.profiles?.display_name || 'this admin'}?`}
          message="They'll lose access to the admin panel immediately."
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </AdminLayout>
  )
}
