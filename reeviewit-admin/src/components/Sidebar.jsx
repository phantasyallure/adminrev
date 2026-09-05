import { NavLink } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

const LINKS = [
  { to: '/', label: 'Dashboard', icon: '⌂', requires: null, end: true },
  { to: '/reviews', label: 'Reviews', icon: '★', requires: 'can_approve_reviews' },
  { to: '/products', label: 'Products', icon: '▣', requires: 'can_approve_reviews' },
  { to: '/places', label: 'Places', icon: '⚑', requires: 'can_manage_places' },
  { to: '/keywords', label: 'Keywords', icon: '🔎', requires: 'can_manage_places' },
  { to: '/keyword-suggestions', label: 'AI keywords', icon: '✨', requires: 'can_manage_places' },
  { to: '/business-claims', label: 'Business claims', icon: '🏷️', requires: 'can_manage_places' },
  { to: '/import', label: 'Import', icon: '⇪', requires: 'can_manage_places' },
  { to: '/suggestions', label: 'Suggestions', icon: '✎', requires: 'can_manage_places' },
  { to: '/place-photos', label: 'Place photos', icon: '📷', requires: 'can_manage_places' },
  { to: '/category-images', label: 'Category images', icon: '🖼', requires: 'can_manage_places' },
  { to: '/users', label: 'Users', icon: '◎', requires: 'can_ban_users' },
  { to: '/badges', label: 'Badges', icon: '⬥', requires: 'can_award_badges' },
  { to: '/roles', label: 'Roles', icon: '⚙', requires: 'can_manage_roles' },
]

export default function Sidebar({ open, onNavigate }) {
  const { hasPermission, profile, signOut } = useAdminAuth()

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand">
        reeview<span>it</span> — admin
      </div>
      {LINKS.filter((l) => !l.requires || hasPermission(l.requires)).map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          onClick={onNavigate}
        >
          <span aria-hidden="true">{l.icon}</span> {l.label}
        </NavLink>
      ))}
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8 }}>{profile?.display_name || 'Admin'}</div>
        <button className="btn-ghost btn-small" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
