import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { PERMISSIONS, useAdminAuth } from '../context/AdminAuthContext'
import { fetchAdmins, findProfileByName, upsertAdmin, removeAdmin } from '../lib/adminApi'

const PRESETS = {
  Moderator: { can_approve_reviews: true, can_delete_reviews: true },
  'Content Manager': { can_manage_places: true },
  'Community Manager': { can_ban_users: true, can_award_badges: true },
  Owner: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])),
}

function emptyPerms() {
  return Object.fromEntries(PERMISSIONS.map((p) => [p.key, false]))
}

export default function Roles() {
  const { user } = useAdminAuth()
  const [admins, setAdmins] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null) // profile being granted a role
  const [roleLabel, setRoleLabel] = useState('Moderator')
  const [perms, setPerms] = useState(PRESETS.Moderator)
  const [removeTarget, setRemoveTarget] = useState(null)

  const load = () => fetchAdmins().then(setAdmins).catch(console.error)
  useEffect(load, [])

  const search = async (val) => {
    setQ(val)
    if (val.trim().length < 2) { setResults([]); return }
    setResults(await findProfileByName(val))
  }

  const applyPreset = (label) => {
    setRoleLabel(label)
    setPerms({ ...emptyPerms(), ...(PRESETS[label] || {}) })
  }

  const togglePerm = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }))

  const grant = async () => {
    await upsertAdmin(selected.id, { role_label: roleLabel, ...perms }, user.id)
    setSelected(null)
    setQ(''); setResults([])
    load()
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
          <p>Decide who can approve reviews, manage places, ban users, or manage other admins.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 }}>
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
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Grant admin access</h3>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Find an existing user by name</label>
            <input value={q} onChange={(e) => search(e.target.value)} placeholder="They must already have a Reeviewit account" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`btn-ghost btn-small`}
                style={{ justifyContent: 'flex-start', borderColor: selected?.id === r.id ? 'var(--ink)' : undefined }}
                onClick={() => setSelected(r)}
              >
                {r.display_name}
              </button>
            ))}
          </div>

          {selected && (
            <>
              <p style={{ marginBottom: 10 }}>Granting access to <strong>{selected.display_name}</strong></p>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Role label</label>
                <select value={roleLabel} onChange={(e) => applyPreset(e.target.value)}>
                  {Object.keys(PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                {PERMISSIONS.map((p) => (
                  <label key={p.key} className="checkbox-row">
                    <input type="checkbox" checked={Boolean(perms[p.key])} onChange={() => togglePerm(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost btn-small" onClick={() => setSelected(null)}>Cancel</button>
                <button className="btn-primary btn-small" onClick={grant}>Grant access</button>
              </div>
            </>
          )}
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
