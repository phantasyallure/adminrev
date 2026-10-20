import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import Icon from '../components/Icon'
import { useAdminAuth } from '../context/AdminAuthContext'
import { fetchVisitorStats } from '../lib/adminApi'

const COUNTRY_NAMES = {
  DZ: 'Algeria', US: 'United States', FR: 'France', MA: 'Morocco', TN: 'Tunisia',
  EG: 'Egypt', GB: 'United Kingdom', CA: 'Canada', DE: 'Germany', ES: 'Spain',
  IT: 'Italy', SA: 'Saudi Arabia', AE: 'United Arab Emirates', TR: 'Turkey',
  NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', RU: 'Russia', CN: 'China',
  IN: 'India', BR: 'Brazil', Unknown: 'Unknown',
}
const DEVICE_ICON = { mobile: '📱', desktop: '💻', tablet: '📟', unknown: '❔' }
const DEVICE_LABEL = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet', unknown: 'Unknown' }

const countryLabel = (c) => COUNTRY_NAMES[c] || c
const countryFlag = (code) => {
  if (!code || code.length !== 2) return '🌐'
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}
const fmt = (n) => (n ?? 0).toLocaleString('en-US')
const dayLabel = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts)
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' })

function Bars({ rows, labelOf, iconOf }) {
  const max = rows?.[0]?.count || 1
  if (!rows?.length) return <p className="muted">No visits recorded for this day.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => (
        <div key={labelOf(r)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 5 }}>
            <span>{iconOf(r)} {labelOf(r)}</span>
            <span className="muted">{fmt(r.count)}</span>
          </div>
          <div className="visitor-bar-track">
            <div className="visitor-bar-fill" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Visitors() {
  const { session } = useAdminAuth()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState(null) // null = today
  const [range, setRange] = useState(30)

  const load = (silent = false) => {
    if (!session?.access_token) return
    if (!silent) setLoading(true)
    fetchVisitorStats(session.access_token, { day: day || undefined, days: range })
      .then((s) => { setStats(s); setError(null) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [session, day, range]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep "today" live: refresh every minute while viewing it.
  useEffect(() => {
    if (day) return undefined
    const t = setInterval(() => load(true), 60000)
    return () => clearInterval(t)
  }, [session, day, range]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = stats?.today
  const selected = stats?.day || today
  const isToday = selected === today
  const daily = stats?.daily ?? []
  const todayRow = daily.find((d) => d.day === today)
  const yesterdayRow = daily[daily.length - 2]
  const maxDaily = useMemo(() => Math.max(1, ...daily.map((d) => d.visits)), [daily])
  const avg = daily.length ? Math.round(daily.reduce((n, d) => n + d.visits, 0) / daily.length) : 0
  const sel = stats?.selected
  const hourMax = Math.max(1, ...(sel?.byHour ?? []).map((h) => h.count))
  const hours = Array.from({ length: 24 }, (_, h) => sel?.byHour?.find((x) => x.hour === h)?.count ?? 0)

  return (
    <AdminLayout title="Visitors">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Visitors</h1>
          <p>The daily counter starts at 0 every midnight (Algeria time). Every past day stays saved.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            className="date-input"
            value={selected || ''}
            max={today || undefined}
            onChange={(e) => setDay(e.target.value && e.target.value !== today ? e.target.value : null)}
          />
          {!isToday && <button className="btn-primary btn-small" onClick={() => setDay(null)}>Back to today</button>}
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="visitor-hero">
        <div className="visitor-hero-main">
          <div className="hero-chip">{isToday ? <><span className="live-dot" /> Today · live</> : dayLabel(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="visitor-hero-num">{loading && !sel ? '—' : fmt(sel?.visits)}</div>
          <div className="visitor-hero-label">
            {isToday ? 'Visits today' : 'Visits that day'} · {fmt(sel?.uniques)} unique visitors
          </div>
        </div>
        <div className="visitor-hero-split">
          <div>
            <div className="visitor-hero-sub-num">{fmt(stats?.allTime?.total)}</div>
            <div className="visitor-hero-label" style={{ color: 'var(--ink-faint)' }}>
              Total visitors since ever{stats?.allTime?.since ? ` · from ${new Date(stats.allTime.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
          <div className="mini-split">
            <div>
              <div className="visitor-hero-sub-num" style={{ fontSize: 22 }}>{fmt(yesterdayRow?.visits)}</div>
              <div className="visitor-hero-label" style={{ color: 'var(--ink-faint)' }}>Yesterday</div>
            </div>
            <div>
              <div className="visitor-hero-sub-num" style={{ fontSize: 22 }}>{fmt(avg)}</div>
              <div className="visitor-hero-label" style={{ color: 'var(--ink-faint)' }}>Daily average</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <h3>History</h3>
          <div className="tabs" style={{ margin: 0 }}>
            {[14, 30, 90].map((r) => (
              <button key={r} className={`tab${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>{r} days</button>
            ))}
          </div>
        </div>
        <div className="daily-chart">
          {daily.map((d) => {
            const active = d.day === selected
            return (
              <button
                key={d.day}
                type="button"
                className={`daily-col${active ? ' active' : ''}${d.day === today ? ' is-today' : ''}`}
                onClick={() => setDay(d.day === today ? null : d.day)}
                title={`${dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })} — ${fmt(d.visits)} visits, ${fmt(d.uniques)} unique`}
              >
                <span className="daily-bar" style={{ height: `${Math.max(d.visits ? 6 : 2, (d.visits / maxDaily) * 100)}%` }} />
              </button>
            )
          })}
        </div>
        <div className="daily-axis">
          <span>{daily[0] ? dayLabel(daily[0].day, { day: 'numeric', month: 'short' }) : ''}</span>
          <span className="muted">Tap a bar to open that day</span>
          <span>Today: {fmt(todayRow?.visits)}</span>
        </div>
      </div>

      <div className="two-col even">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>By country</h3>
          <Bars rows={sel?.byCountry} labelOf={(c) => countryLabel(c.country)} iconOf={(c) => countryFlag(c.country)} />
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>By device</h3>
          <Bars rows={sel?.byDevice} labelOf={(d) => DEVICE_LABEL[d.device] || d.device} iconOf={(d) => DEVICE_ICON[d.device] || '❔'} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 14 }}>Visits by hour</h3>
        <div className="hour-chart">
          {hours.map((n, h) => (
            <div key={h} className="hour-col" title={`${String(h).padStart(2, '0')}:00 — ${n} visits`}>
              <span style={{ height: `${Math.max(n ? 8 : 3, (n / hourMax) * 100)}%` }} />
              <i>{h % 6 === 0 ? h : ''}</i>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginBottom: 14 }}>{isToday ? 'Latest visits today' : 'Visits that day'}</h3>
        {!sel?.recent?.length ? (
          <p className="muted">Nothing to show for this day.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sel.recent.map((v, i) => (
              <div key={i} className="visitor-row">
                <span className="visitor-ip">{v.ip_address || '—'}</span>
                <span>{countryFlag(v.country)} {v.country || '—'}</span>
                <span>{DEVICE_ICON[v.device_type] || '❔'} {DEVICE_LABEL[v.device_type] || 'Unknown'}</span>
                <span className="muted">{timeOf(v.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
