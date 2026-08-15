import { Routes, Route } from 'react-router-dom'
import { AdminAuthProvider } from './context/AdminAuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Reviews from './pages/Reviews'
import ProductPosts from './pages/ProductPosts'
import Places from './pages/Places'
import Suggestions from './pages/Suggestions'
import Users from './pages/Users'
import Badges from './pages/Badges'
import Roles from './pages/Roles'

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/reviews" element={<ProtectedRoute requires="can_approve_reviews"><Reviews /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute requires="can_approve_reviews"><ProductPosts /></ProtectedRoute>} />
        <Route path="/places" element={<ProtectedRoute requires="can_manage_places"><Places /></ProtectedRoute>} />
        <Route path="/suggestions" element={<ProtectedRoute requires="can_manage_places"><Suggestions /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute requires="can_ban_users"><Users /></ProtectedRoute>} />
        <Route path="/badges" element={<ProtectedRoute requires="can_award_badges"><Badges /></ProtectedRoute>} />
        <Route path="/roles" element={<ProtectedRoute requires="can_manage_roles"><Roles /></ProtectedRoute>} />
      </Routes>
    </AdminAuthProvider>
  )
}
