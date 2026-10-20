import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import Icon from '../components/Icon'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchDashboardStats, fetchTopReviewers, fetchPendingCounts, fetchVisitorStats } from '../lib/adminApi'

const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'))

export default function Dashboard() {
  const { profile, hasPermission, session } = useAdminAuth()
  const [stats, setStats] = useState(null)
  const [top, setTop] = useState([])
  const [pending, setPending] = useState(null)
  const [visits, setVisits] = useState(null)

  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(console.error)
    fetchTopReviewers(5).then(setTop).catch(console.error)
    fetchPendingCounts().then(setPending).catch(console.error)
  }, [])

  useEffect(() => {
    if (!session?.access_token) return
    fetchVisitorStats(session.access_token, { days: 14 }).then(setVisits).catch(() => {})
  }, [session])

  const queue = [
    { label: 'Reviews', n: pending?.reviews, to: '/reviews', perm: 'can_approve_reviews' },
    { label: 'Products', n: pending?.products, to: '/products', perm: 'can_approve_reviews' },
    { label: 'Place suggestions', n: pending?.suggestions, to: '/suggestions', perm: 'can_manage_places' },
    { label: 'Place photos', n: pending?.photos, to: '/place-photos', perm: 'can_manage_places' },
    { label: 'Business claims', n: pending?.claims, to: '/business-claims', perm: 'can_manage_places' },
    { label: 'AI keywords', n: pending?.keywords, to: '/keyword-suggestions', perm: 'can_manage_places' },
  ].filter((q) => hasPermission(q.perm))

  const daily = visits?.daily ?? []
  const max = Math.max(1, ...daily.map((d) => d.visits))

  return (
    <AdminLayout title="Dashboard">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 26 }}>Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}</h1>
          <p>Here's what's happening on Rayyek today.</p>
        </div>
      </div>

      <div className="stat-grid">
        <Link to="/visitors" className="stat-card accent">
          <div className="stat-icon"><Icon name="globe" /></div>
          <div className="num">{fmt(visits?.selected?.visits)}</div>
          <div className="label">Visitors today</div>
        </Link>
        <Link to="/visitors" className="stat-card">
          <div className="stat-icon"><Icon name="chart" /></div>
          <div className="num">{fmt(visits?.allTime?.total)}</div>
          <div className="label">Visitors since ever</div>
        </Link>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="pin" /></div>
          <div className="num">{fmt(stats?.totalPlaces)}</div>
          <div className="label">Places listed</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="users" /></div>
          <div className="num">{fmt(stats?.totalUsers)}</div>
          <div className="label">Registered users</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="ban" /></div>
          <div className="num">{fmt(stats?.bannedUsers)}</div>
          <div className="label">Banned users</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <h3>Waiting for you</h3>
          </div>
          {queue.length === 0 ? (
            <p className="muted">Nothing for your role.</p>
          ) : (
            <div className="queue-list">
              {queue.map((q) => (
                <Link key={q.to} to={q.to} className="queue-row">
                  <span>{q.label}</span>
                  <em className={`count-pill${q.n ? '' : ' zero'}`}>{q.n ?? '…'}</em>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Last 14 days</h3>
            <Link className="btn-ghost btn-small" to="/visitors">Details</Link>
          </div>
          <div className="daily-chart mini">
            {daily.map((d) => (
              <span key={d.day} className="daily-col static" title={`${d.day}: ${d.visits}`}>
                <span className="daily-bar" style={{ height: `${Math.max(d.visits ? 6 : 2, (d.visits / max) * 100)}%` }} />
              </span>
            ))}
          </div>
        </div>
      </div>

      {hasPermission('can_award_badges') && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <h3>Top reviewers</h3>
            <Link className="btn-ghost btn-small" to="/badges">Award a badge</Link>
          </div>
          {top.length === 0 ? (
            <p>No reviews yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top.map((u, i) => (
                <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{i + 1}. {u.display_name}</span>
                  <span className="muted">{u.review_count} reviews</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
