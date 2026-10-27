import { useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import SearchInput from '../components/SearchInput'
import Icon from '../components/Icon'
import {
  parsePhone, parseContactsFile, fetchContacts, importContacts, setContacted, deleteContacts,
} from '../lib/whatsappApi'
import './WhatsAppContacts.css'

const LS_MSG = 'admin.whatsapp.message'
const DEFAULT_MSG = 'Bonjour, je vous contacte de la part de Rayyek.'

export default function WhatsAppContacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('All')
  const [q, setQ] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirm, setConfirm] = useState(null) // { ids, label }
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(() => {
    try { return localStorage.getItem(LS_MSG) ?? DEFAULT_MSG } catch { return DEFAULT_MSG }
  })

  useEffect(() => {
    try { localStorage.setItem(LS_MSG, msg) } catch { /* ignore */ }
  }, [msg])

  const load = async () => {
    setLoading(true)
    try {
      setContacts(await fetchContacts())
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load contacts. Did you run supabase/whatsapp_contacts.sql?')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const waLink = (num) =>
    `https://wa.me/${num}${msg.trim() ? `?text=${encodeURIComponent(msg.trim())}` : ''}`

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(contacts.map((c) => c.category))).sort()],
    [contacts],
  )

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return contacts.filter((c) => {
      if (tab !== 'All' && c.category !== tab) return false
      if (hideDone && c.contacted) return false
      if (!s) return true
      return [c.name, c.cuisine, c.location, c.phone, c.alt_phone]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(s))
    })
  }, [contacts, tab, q, hideDone])

  const doneCount = contacts.filter((c) => c.contacted).length
  const allVisibleSelected = rows.length > 0 && rows.every((c) => selected.has(c.id))

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { rows: parsed, skippedSheets } = await parseContactsFile(file)
      if (!parsed.length) throw new Error('No restaurants found. The file needs a "Name" and a "Phone" column.')
      const { added, skipped } = await importContacts(parsed, contacts)
      await load()
      setNotice(
        `${added} contact${added === 1 ? '' : 's'} added` +
        (skipped ? `, ${skipped} already in the list` : '') +
        (skippedSheets.length ? `. Sheet skipped: ${skippedSheets.join(', ')}` : '') + '.',
      )
    } catch (err) {
      setError(err.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const toggleDone = async (c) => {
    const next = !c.contacted
    setContacts((list) => list.map((x) => (x.id === c.id ? { ...x, contacted: next } : x)))
    try {
      await setContacted(c.id, next)
    } catch (err) {
      setContacts((list) => list.map((x) => (x.id === c.id ? { ...x, contacted: !next } : x)))
      setError(err.message)
    }
  }

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) rows.forEach((c) => next.delete(c.id))
      else rows.forEach((c) => next.add(c.id))
      return next
    })

  const runDelete = async () => {
    const { ids } = confirm
    setConfirm(null)
    setBusy(true)
    try {
      await deleteContacts(ids)
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      await load()
      setNotice(`${ids.length} contact${ids.length === 1 ? '' : 's'} deleted.`)
    } catch (err) {
      setError(err.message || 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  const renderPhone = (raw) => {
    const p = parsePhone(raw)
    if (!p) return null
    if (p.wa) {
      return (
        <a className="wa-btn" href={waLink(p.wa)} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size={15} />
          {p.raw}
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
          <p>{contacts.length} restaurants · {doneCount} contacted. Tap a number to open WhatsApp.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {selected.size > 0 && (
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => setConfirm({ ids: [...selected], label: `${selected.size} selected contact${selected.size === 1 ? '' : 's'}` })}
            >
              <Icon name="trash" size={16} />&nbsp;Delete selected ({selected.size})
            </button>
          )}
          <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} />&nbsp;{busy ? 'Working…' : 'Upload Excel'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onUpload} />
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      {notice && <div className="notice ok" style={{ marginBottom: 16 }}>{notice}</div>}

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
        {categories.map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {contacts.length === 0 ? 'No contacts yet. Click "Upload Excel" to add your list.' : 'No results.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all shown" />
                  </th>
                  <th style={{ width: 60 }}>Done</th>
                  <th>Restaurant</th>
                  <th>WhatsApp</th>
                  <th>Category</th>
                  <th style={{ width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={c.contacted ? 'row-banned' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        aria-label={`Select ${c.name}`}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!c.contacted}
                        onChange={() => toggleDone(c)}
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
                        {renderPhone(c.alt_phone)}
                      </div>
                    </td>
                    <td><span className="badge-pill badge-pending">{c.category}</span></td>
                    <td>
                      <button
                        className="icon-btn wa-del"
                        title="Delete"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => setConfirm({ ids: [c.id], label: c.name })}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title="Delete contact"
          message={`Delete ${confirm.label}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={runDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminLayout>
  )
}
