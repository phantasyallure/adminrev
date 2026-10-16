import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AdminLayout({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="admin-shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 30 }}
        />
      )}
      <div className="main-col">
        <Topbar title={title} onMenuClick={() => setSidebarOpen((o) => !o)} />
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
