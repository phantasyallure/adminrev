import { useAdminAuth } from '../context/AdminAuthContext'

export default function Topbar({ title, onMenuClick }) {
  const { profile } = useAdminAuth()
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="menu-toggle" onClick={onMenuClick} aria-label="Open menu">☰</button>
        <h2 style={{ fontSize: 18 }}>{title}</h2>
      </div>
      <div className="topbar-user">
        <img
          className="avatar-thumb"
          style={{ width: 30, height: 30, borderRadius: '50%' }}
          src={profile?.avatar_url || 'https://api.dicebear.com/7.x/initials/svg?seed=' + (profile?.display_name || 'A')}
          alt=""
        />
        <span>{profile?.display_name}</span>
      </div>
    </div>
  )
}
