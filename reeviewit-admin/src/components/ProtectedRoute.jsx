import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function ProtectedRoute({ children, requires }) {
  const { session, adminProfile, loading, notAuthorized, hasPermission } = useAdminAuth()

  if (loading) return <div className="login-shell"><p>Loading…</p></div>
  if (!session) return <Navigate to="/login" replace />
  if (notAuthorized || !adminProfile) return <Navigate to="/login" replace />
  if (requires && !hasPermission(requires)) {
    return (
      <div className="content">
        <div className="card empty-state">
          <h3>Not authorized</h3>
          <p>Your admin role doesn't include this permission. Ask an Owner to grant it from Roles.</p>
        </div>
      </div>
    )
  }
  return children
}
