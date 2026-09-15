import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'
import TurnstileWidget from '../components/TurnstileWidget'

export default function Login() {
  const { session, adminProfile, notAuthorized, loading, signIn, signOut } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // TurnstileWidget renders nothing (and this stays null) unless
  // VITE_TURNSTILE_SITE_KEY is set — safe default, no bot check until
  // it's configured. captchaResetKey forces a fresh widget/challenge
  // after every attempt, since a used or errored token can't be reused.
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaResetKey, setCaptchaResetKey] = useState(0)

  if (!loading && session && adminProfile) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password, captchaToken)
    } catch (err) {
      setError(err.message || 'Sign in failed')
      setCaptchaToken(null)
      setCaptchaResetKey((k) => k + 1)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>reeviewit</div>
        <h1 style={{ fontSize: 26, marginBottom: 22 }}>Administration</h1>

        {notAuthorized && session ? (
          <div>
            <p style={{ marginBottom: 16 }}>
              This account is signed in but doesn't have an admin role. Ask an Owner to add you from Roles.
            </p>
            <button className="btn-ghost" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <TurnstileWidget
              key={captchaResetKey}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
            {error && <p className="error-text">{error}</p>}
            <button className="btn-primary" type="submit" disabled={submitting} style={{ marginTop: 6 }}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="muted">
              Admin accounts are the same login as reeview.it. A super admin grants access from the Roles page.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
