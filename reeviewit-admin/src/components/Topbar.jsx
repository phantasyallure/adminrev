import { useAdminAuth } from '../context/AdminAuthContext'
import Icon from './Icon'

export default function Topbar({ title, onMenuClick }) {
  const { profile } = useAdminAuth()
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="menu-toggle" onClick={onMenuClick} aria-label="Open menu"><Icon name="menu" size={22} /></button>
        <div>
          <h2 style={{ fontSize: 18, lineHeight: 1.1 }}>{title}</h2>
          <div className="topbar-date">{today}</div>
        </div>
      </div>
      <div className="topbar-user">
        <img
          className="avatar-thumb"
          style={{ width: 32, height: 32, borderRadius: '50%' }}
          src={profile?.avatar_url || 'https://api.dicebear.com/7.x/initials/svg?seed=' + (profile?.display_name || 'A')}
          alt=""
        />
        <span className="topbar-name">{profile?.display_name}</span>
      </div>
    </div>
  )
}
