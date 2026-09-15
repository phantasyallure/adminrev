import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchVisitorStats } from '../lib/adminApi'

export default function Visitors() {
  const { session } = useAdminAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!session?.access_token) return
    fetchVisitorStats(session.access_token)
      .then(setStats)
      .catch((err) => setError(err.message))
  }, [session])

  return (
    <AdminLayout title="Visitors">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Visitors</h1>
          <p>Who's landing on Rayyek, and where from.</p>
        </div>
      </div>

      {error && <p className="muted">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{stats?.totalVisits ?? '—'}</div>
          <div className="label">Total visits</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats?.visitsToday ?? '—'}</div>
          <div className="label">Visits in last 24h</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats?.uniqueIps ?? '—'}</div>
          <div className="label">Unique IP addresses</div>
        </div>
      </div>

      <div className="two-col even">
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>By country</h3>
          {!stats?.byCountry?.length ? (
            <p className="muted">No data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.byCountry.map((c) => (
                <div key={c.country} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{c.country}</span>
                  <span className="muted">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Recent visits</h3>
          {!stats?.recent?.length ? (
            <p className="muted">No data yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.recent.map((v, i) => (
                <div key={i} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="muted">{v.ip_address || '—'}</span>
                  <span>{v.country || '—'}</span>
                  <span className="muted">{new Date(v.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
