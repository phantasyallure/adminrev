import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'
import {
  fetchBadges, createBadge, deleteBadge, awardBadge, fetchTopReviewers, uploadBadgeIcon, findProfileByName,
} from '../lib/adminApi'

export default function Badges() {
  const { user } = useAdminAuth()
  const [badges, setBadges] = useState([])
  const [topReviewers, setTopReviewers] = useState([])
  const [name, setName] = useState('')
  const [iconUrl, setIconUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [awardUserQuery, setAwardUserQuery] = useState('')
  const [awardResults, setAwardResults] = useState([])
  const [awardBadgeId, setAwardBadgeId] = useState('')
  const [message, setMessage] = useState('')

  const load = () => {
    fetchBadges().then(setBadges).catch(console.error)
    fetchTopReviewers(10).then(setTopReviewers).catch(console.error)
  }
  useEffect(load, [])

  const handleIconFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setCreateError('')
    try {
      const url = await uploadBadgeIcon(file)
      setIconUrl(url)
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleCreateBadge = async (e) => {
    e.preventDefault()
    if (!iconUrl) {
      setCreateError('Upload an icon image first.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      await createBadge({ name, icon_url: iconUrl, icon: '🏅' })
      setName('')
      setIconUrl('')
      load()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const searchUsers = async (q) => {
    setAwardUserQuery(q)
    if (q.trim().length < 2) { setAwardResults([]); return }
    const res = await findProfileByName(q)
    setAwardResults(res)
  }

  const handleAward = async (userId) => {
    if (!awardBadgeId) { setMessage('Pick a badge first.'); return }
    try {
      await awardBadge(userId, awardBadgeId, user.id)
      setMessage('Badge awarded.')
      setAwardResults([])
      setAwardUserQuery('')
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <AdminLayout title="Badges">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Badges</h1>
          <p>Create badge types with real artwork and award them to users.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Create a badge</h3>
          <form onSubmit={handleCreateBadge} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Verified Reviewer" />
            </div>
            <div className="field">
              <label>Icon image (SVG or PNG)</label>
              <input type="file" accept="image/*,.svg" onChange={handleIconFile} />
              {uploading && <span className="muted">Uploading…</span>}
              {iconUrl && <img src={iconUrl} alt="" style={{ width: 56, height: 56, marginTop: 6 }} />}
            </div>
            {createError && <p className="error-text">{createError}</p>}
            <button className="btn-primary btn-small" type="submit" disabled={creating || uploading} style={{ alignSelf: 'flex-start' }}>
              {creating ? 'Saving…' : 'Create badge'}
            </button>
          </form>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {badges.map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {b.icon_url ? <img src={b.icon_url} alt="" style={{ width: 24, height: 24 }} /> : b.icon}
                  {b.name}
                </span>
                <button className="btn-ghost btn-small" onClick={() => deleteBadge(b.id).then(load)}>Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Award a badge</h3>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Badge</label>
            <select value={awardBadgeId} onChange={(e) => setAwardBadgeId(e.target.value)}>
              <option value="">Choose a badge…</option>
              {badges.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Find user by name</label>
            <input value={awardUserQuery} onChange={(e) => searchUsers(e.target.value)} placeholder="Type a name…" />
          </div>
          {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {awardResults.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{r.display_name}</span>
                <button className="btn-ghost btn-small" onClick={() => handleAward(r.id)}>Award</button>
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 14 }}>Most active reviewers</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topReviewers.map((u, i) => (
              <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{i + 1}. {u.display_name}</span>
                <span className="muted">{u.review_count} reviews</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
