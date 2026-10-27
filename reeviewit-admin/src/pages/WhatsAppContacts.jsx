import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import SearchInput from '../components/SearchInput'
import Icon from '../components/Icon'
import { WA_CONTACTS } from '../lib/whatsappContacts'
import './WhatsAppContacts.css'

const TABS = ['All', 'Upscale', 'Fast Food', 'Unverified']
const LS_DONE = 'admin.whatsapp.contacted'
const LS_MSG = 'admin.whatsapp.message'
const DEFAULT_MSG = 'Bonjour, je vous contacte de la part de Rayyek.'

const keyOf = (c) => `${c.category}|${c.name}`

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return fallback
  }
}

export default function WhatsAppContacts() {
  const [tab, setTab] = useState('All')
  const [q, setQ] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [done, setDone] = useState(() => load(LS_DONE, {}))
  const [msg, setMsg] = useState(() => load(LS_MSG, DEFAULT_MSG))

  useEffect(() => {
    try { localStorage.setItem(LS_DONE, JSON.stringify(done)) } catch { /* ignore */ }
  }, [done])
  useEffect(() => {
    try { localStorage.setItem(LS_MSG, JSON.stringify(msg)) } catch { /* ignore */ }
  }, [msg])

  const waLink = (num) =>
    `https://wa.me/${num}${msg.trim() ? `?text=${encodeURIComponent(msg.trim())}` : ''}`

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return WA_CONTACTS.filter((c) => {
      if (tab !== 'All' && c.category !== tab) return false
      if (hideDone && done[keyOf(c)]) return false
      if (!s) return true
      return [c.name, c.cuisine, c.location, c.phone?.raw, c.alt?.raw]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(s))
    })
  }, [tab, q, hideDone, done])

  const doneCount = WA_CONTACTS.filter((c) => done[keyOf(c)]).length

  const toggle = (c) =>
    setDone((d) => {
      const k = keyOf(c)
      const next = { ...d }
      if (next[k]) delete next[k]
      else next[k] = true
      return next
    })

  const renderPhone = (p) => {
    if (!p) return null
    if (p.wa) {
      return (
        <a className="wa-btn" href={waLink(p.wa)} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size={15} />
          {p.raw.replace(/\s*\(.*?\)/g, '')}
        </a>
      )
    }
    return (
      <span className="wa-bad" title="Incomplete number or landline: WhatsApp link disabled">
        {p.raw} ⚠
      </span>
    )
  }

  return (
    <AdminLayout title="WhatsApp">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>WhatsApp contacts</h1>
          <p>
            {WA_CONTACTS.length} restaurants · {doneCount} contacted. Tap a number to open WhatsApp.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="wa-msg">Message pre-filled in WhatsApp (optional)</label>
          <textarea id="wa-msg" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </div>
      </div>

      <div className="wa-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, cuisine, location, number…" />
        <label className="checkbox-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide contacted
        </label>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty-state">No results.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Done</th>
                  <th>Restaurant</th>
                  <th>WhatsApp</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={keyOf(c)} className={done[keyOf(c)] ? 'row-banned' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!done[keyOf(c)]}
                        onChange={() => toggle(c)}
                        aria-label={`Mark ${c.name} as contacted`}
                      />
                    </td>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="muted">{[c.cuisine, c.location].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>
                      <div className="wa-phones">
                        {renderPhone(c.phone)}
                        {renderPhone(c.alt)}
                      </div>
                    </td>
                    <td><span className="badge-pill badge-pending">{c.category}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
