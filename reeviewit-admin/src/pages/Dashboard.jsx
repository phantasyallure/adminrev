import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchDashboardStats, fetchTopReviewers } from '../lib/adminApi'

export default function Dashboard() {
  const { profile, hasPermission } = useAdminAuth()
  const [stats, setStats] = useState(null)
  const [top, setTop] = useState([])

  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(console.error)
    fetchTopReviewers(5).then(setTop).catch(console.error)
  }, [])

  return (
    <AdminLayout title="Dashboard">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}</h1>
          <p>Here's what's happening on Reeviewit.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{stats?.pendingReviews ?? '—'}</div>
          <div className="label">Reviews awaiting approval</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats?.pendingProductPosts ?? '—'}</div>
          <div className="label">Products awaiting approval</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats?.totalPlaces ?? '—'}</div>
          <div className="label">Places listed</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats?.totalUsers ?? '—'}</div>
          <div className="label">Registered users</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats?.bannedUsers ?? '—'}</div>
          <div className="label">Banned users</div>
        </div>
      </div>

      <div className="two-col even">
        {hasPermission('can_approve_reviews') && (
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Moderation queue</h3>
            <p style={{ marginBottom: 16 }}>
              {stats?.pendingReviews
                ? `${stats.pendingReviews} review${stats.pendingReviews === 1 ? '' : 's'} waiting for a decision.`
                : 'Nothing waiting — queue is clear.'}
            </p>
            <Link className="btn-primary btn-small" to="/reviews">Go to reviews</Link>
          </div>
        )}

        {hasPermission('can_approve_reviews') && (
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Product moderation queue</h3>
            <p style={{ marginBottom: 16 }}>
              {stats?.pendingProductPosts
                ? `${stats.pendingProductPosts} product post${stats.pendingProductPosts === 1 ? '' : 's'} waiting for a decision.`
                : 'Nothing waiting — queue is clear.'}
            </p>
            <Link className="btn-primary btn-small" to="/products">Go to products</Link>
          </div>
        )}

        {hasPermission('can_award_badges') && (
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Top reviewers</h3>
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
            <Link className="btn-ghost btn-small" style={{ marginTop: 14 }} to="/badges">Award a badge</Link>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
