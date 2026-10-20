import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import Icon from '../components/Icon'
import { useAdminAuth } from '../context/AdminAuthContext'
import { sendPushNotification, fetchPushStats, fetchPushCampaigns, findProfileByName } from '../lib/adminApi'

const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Notifications() {
  const { session } = useAdminAuth()
  const [params] = useSearchParams()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkPath, setLinkPath] = useState('/')
  const [audience, setAudience] = useState(params.get('user') ? 'user' : 'all')
  const [target, setTarget] = useState(params.get('user') ? { id: params.get('user'), display_name: params.get('name') || 'User' } : null)
  const [userQ, setUserQ] = useState('')
  const [userResults, setUserResults] = useState([])
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const loadMeta = () => {
    fetchPushStats().then(setStats).catch(() => {})
    fetchPushCampaigns().then(setHistory).catch(() => {})
  }
  useEffect(loadMeta, [])

  useEffect(() => {
    if (userQ.trim().length < 2) { setUserResults([]); return undefined }
    const t = setTimeout(() => findProfileByName(userQ.trim()).then(setUserResults).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [userQ])

  const canSend = title.trim() && body.trim() && (audience === 'all' || target) && !sending

  const send = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setSending(true)
    try {
      const res = await sendPushNotification(
        { title, body, linkPath, audience, userId: audience === 'user' ? target?.id : undefined },
        session?.access_token
      )
      setResult(res)
      setTitle('')
      setBody('')
      loadMeta()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <AdminLayout title="Notifications">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Notifications</h1>
          <p>Send a message that pops up on users' phones and computers, and also appears in their in-site bell.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="num">{stats?.devices ?? '—'}</div><div className="label">Devices subscribed</div></div>
        <div className="stat-card"><div className="num">{stats?.users ?? '—'}</div><div className="label">Users reachable by push</div></div>
        <div className="stat-card"><div className="num">{history.length ? history[0].pushed : '—'}</div><div className="label">Devices reached by last send</div></div>
      </div>

      <div className="two-col">
        <form className="card" onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3>New notification</h3>

          <div className="seg">
            <button type="button" className={audience === 'all' ? 'on' : ''} onClick={() => setAudience('all')}>Everyone</button>
            <button type="button" className={audience === 'user' ? 'on' : ''} onClick={() => setAudience('user')}>One user</button>
          </div>

          {audience === 'user' && (
            <div className="field">
              <label>Recipient</label>
              {target ? (
                <div className="chip-row">
                  <span className="chip">{target.display_name}</span>
                  <button type="button" className="btn-ghost btn-small" onClick={() => setTarget(null)}>Change</button>
                </div>
              ) : (
                <>
                  <input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Search a user by name…" />
                  {userResults.length > 0 && (
                    <div className="pick-list">
                      {userResults.map((u) => (
                        <button type="button" key={u.id} onClick={() => { setTarget(u); setUserQ(''); setUserResults([]) }}>{u.display_name}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="field">
            <label>Title <span className="muted">({title.length}/80)</span></label>
            <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Nouveau : les pâtisseries d'Oran 🥐" />
          </div>
          <div className="field">
            <label>Message <span className="muted">({body.length}/300)</span></label>
            <textarea rows={4} value={body} maxLength={300} onChange={(e) => setBody(e.target.value)} placeholder="Découvre les meilleures adresses près de toi." />
          </div>
          <div className="field">
            <label>Opens this page on the site</label>
            <input value={linkPath} onChange={(e) => setLinkPath(e.target.value)} placeholder="/" />
          </div>

          {error && <p className="error-text">{error}</p>}
          {result && (
            <div className="notice ok">
              Sent to {result.recipients} user{result.recipients === 1 ? '' : 's'} — {result.pushed} device{result.pushed === 1 ? '' : 's'} popped up
              {result.failed ? `, ${result.failed} failed` : ''}. Users without push enabled still get it in their bell.
            </div>
          )}

          <div>
            <button className="btn-primary" disabled={!canSend}>
              <Icon name="send" size={16} />&nbsp;{sending ? 'Sending…' : audience === 'all' ? 'Send to everyone' : 'Send'}
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Preview</h3>
            <div className="push-preview">
              <div className="push-app"><span className="brand-mark" style={{ width: 20, height: 20, fontSize: 11 }}>R</span> Rayyek · now</div>
              <div className="push-title">{title || 'Your title'}</div>
              <div className="push-body">{body || 'Your message appears here, just like on the phone.'}</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Recent sends</h3>
            {history.length === 0 ? (
              <p className="muted">Nothing sent yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {history.map((h) => (
                  <div key={h.id} className="history-row">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{h.title}</div>
                      <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.body}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13 }}>{h.pushed}/{h.recipients}</div>
                      <div className="muted">{when(h.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
