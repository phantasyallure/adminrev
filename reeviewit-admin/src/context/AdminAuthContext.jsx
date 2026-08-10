import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const AdminAuthContext = createContext(null)

// Every permission an admin_users row can carry. Kept in one place so the
// Roles page and permission checks never drift out of sync.
export const PERMISSIONS = [
  { key: 'can_approve_reviews', label: 'Approve / reject reviews' },
  { key: 'can_delete_reviews', label: 'Delete reviews' },
  { key: 'can_manage_places', label: 'Add / edit / delete restaurants & cafeterias' },
  { key: 'can_ban_users', label: 'Ban users' },
  { key: 'can_delete_users', label: 'Delete users' },
  { key: 'can_award_badges', label: 'Award badges' },
  { key: 'can_manage_roles', label: 'Manage admin roles' },
]

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [adminProfile, setAdminProfile] = useState(null) // { user_id, role_label, can_* ... } or null
  const [profile, setProfile] = useState(null) // display_name / avatar from profiles
  const [loading, setLoading] = useState(true)
  const [notAuthorized, setNotAuthorized] = useState(false)

  const loadAdminRow = useCallback(async (userId) => {
    if (!userId) {
      setAdminProfile(null)
      return null
    }
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('Failed to load admin permissions', error)
      setAdminProfile(null)
      return null
    }
    setAdminProfile(data ?? null)
    setNotAuthorized(!data)
    return data
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user?.id) {
        const [{ data: prof }] = await Promise.all([
          supabase.from('profiles').select('id, display_name, avatar_url').eq('id', data.session.user.id).single(),
          loadAdminRow(data.session.user.id),
        ])
        setProfile(prof ?? null)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession?.user?.id) {
        await loadAdminRow(newSession.user.id)
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', newSession.user.id)
          .single()
        setProfile(prof ?? null)
      } else {
        setAdminProfile(null)
        setProfile(null)
        setNotAuthorized(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [loadAdminRow])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = () => supabase.auth.signOut()

  const hasPermission = (key) => Boolean(adminProfile?.[key])

  return (
    <AdminAuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        adminProfile,
        loading,
        notAuthorized,
        hasPermission,
        signIn,
        signOut,
        refreshAdminRow: () => loadAdminRow(session?.user?.id),
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
