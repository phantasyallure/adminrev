import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import { NAV } from '../lib/nav'
import { fetchPendingCounts } from '../lib/adminApi'
import Icon from './Icon'

const STORAGE_KEY = 'admin.sidebar.open'

function loadOpen() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export default function Sidebar({ open, onNavigate }) {
  const { hasPermission, profile, adminProfile, signOut } = useAdminAuth()
  const { pathname } = useLocation()
  const [openGroups, setOpenGroups] = useState(loadOpen)
  const [counts, setCounts] = useState({})

  // Pending-work counters (refresh every minute and on navigation).
  useEffect(() => {
    let alive = true
    const run = () => fetchPendingCounts().then((c) => alive && setCounts(c)).catch(() => {})
    run()
    const t = setInterval(run, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [pathname])

  const toggle = (label) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !isOpen(label, prev) }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const visibleChildren = (g) => g.children.filter((c) => !c.requires || hasPermission(c.requires))
  const groupHasActive = (g) => g.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))
  // A group is open if the user opened it, or it contains the current page.
  const isOpen = (label, state = openGroups) => {
    const g = NAV.find((n) => n.label === label)
    if (g && groupHasActive(g) && state[label] !== false) return true
    return Boolean(state[label])
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-brand">
        <span className="brand-mark">R</span>
        <div>
          <div className="brand-name">rayyek<span>.</span></div>
          <div className="brand-sub">Admin console</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => {
          if (!item.children) {
            if (item.requires && !hasPermission(item.requires)) return null
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                onClick={onNavigate}
              >
                <Icon name={item.icon} /> <span>{item.label}</span>
              </NavLink>
            )
          }

          const kids = visibleChildren(item)
          if (!kids.length) return null
          const expanded = isOpen(item.label)
          const groupCount = kids.reduce((n, k) => n + (k.badge ? counts[k.badge] || 0 : 0), 0)

          return (
            <div key={item.label} className={`sidebar-group${expanded ? ' expanded' : ''}`}>
              <button
                type="button"
                className={`sidebar-group-head${groupHasActive(item) ? ' has-active' : ''}`}
                onClick={() => toggle(item.label)}
                aria-expanded={expanded}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {!expanded && groupCount > 0 && <em className="count-pill">{groupCount}</em>}
                <Icon name="chevron" size={14} className="chev" />
              </button>
              {expanded && (
                <div className="sidebar-sub">
                  {kids.map((c) => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      className={({ isActive }) => `sidebar-sublink${isActive ? ' active' : ''}`}
                      onClick={onNavigate}
                    >
                      <span>{c.label}</span>
                      {c.badge && counts[c.badge] > 0 && <em className="count-pill">{counts[c.badge]}</em>}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <img
            className="avatar-thumb"
            style={{ width: 34, height: 34, borderRadius: '50%' }}
            src={profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.display_name || 'A'}`}
            alt=""
          />
          <div style={{ minWidth: 0 }}>
            <div className="su-name">{profile?.display_name || 'Admin'}</div>
            <div className="su-role">{adminProfile?.role_label || 'Admin'}</div>
          </div>
          <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </aside>
  )
}
