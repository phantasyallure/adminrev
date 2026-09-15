import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchVisitorStats } from '../lib/adminApi'

const COUNTRY_NAMES = {
  DZ: 'Algeria', US: 'United States', FR: 'France', MA: 'Morocco', TN: 'Tunisia',
  EG: 'Egypt', GB: 'United Kingdom', CA: 'Canada', DE: 'Germany', ES: 'Spain',
  IT: 'Italy', SA: 'Saudi Arabia', AE: 'United Arab Emirates', TR: 'Turkey',
  NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', RU: 'Russia', CN: 'China',
  IN: 'India', BR: 'Brazil', Unknown: 'Unknown',
}

function countryLabel(code) {
  return COUNTRY_NAMES[code] || code
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐'
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

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

  const maxCountryCount = stats?.byCountry?.[0]?.count || 1

  return (
    <AdminLayout title="Visitors">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Visitors</h1>
          <p>Who's landing on Rayyek, and where from.</p>
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="visitor-hero">
        <div className="visitor-hero-main">
          <div className="visitor-hero-num">{stats?.totalVisits ?? '—'}</div>
          <div className="visitor-hero-label">Total visits</div>
        </div>
        <div className="visitor-hero-split">
          <div>
            <div className="visitor-hero-sub-num">{stats?.visitsToday ?? '—'}</div>
            <div className="visitor-hero-label">Last 24h</div>
          </div>
          <div>
            <div className="visitor-hero-sub-num">{stats?.uniqueIps ?? '—'}</div>
            <div className="visitor-hero-label">Unique IPs</div>
          </div>
        </div>
      </div>

      <div className="two-col even">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>By country</h3>
          {!stats?.byCountry?.length ? (
            <p className="muted">No visits recorded yet — check back once traffic comes in.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stats.byCountry.map((c) => (
                <div key={c.country}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 5 }}>
                    <span>{countryFlag(c.country)} {countryLabel(c.country)}</span>
                    <span className="muted">{c.count}</span>
                  </div>
                  <div className="visitor-bar-track">
                    <div
                      className="visitor-bar-fill"
                      style={{ width: `${Math.max(4, (c.count / maxCountryCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Recent visits</h3>
          {!stats?.recent?.length ? (
            <p className="muted">Nothing to show yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stats.recent.map((v, i) => (
                <div key={i} className="visitor-row">
                  <span className="visitor-ip">{v.ip_address || '—'}</span>
                  <span>{countryFlag(v.country)} {v.country || '—'}</span>
                  <span className="muted">{timeAgo(v.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
