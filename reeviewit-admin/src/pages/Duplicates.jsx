import { useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { fetchPlacesForDedupe, fetchReviewCountsByPlace, deleteDuplicatePlace } from '../lib/adminApi'
import { findDuplicateGroups } from '../lib/duplicates'

const LEVELS = [
  { value: 3, label: 'Only sure matches' },
  { value: 2, label: 'Sure + likely (recommended)' },
  { value: 1, label: 'Include possible matches' },
]
const LEVEL_LABEL = { 3: 'Sure', 2: 'Likely', 1: 'Possible' }
const DISMISSED_KEY = 'duplicates-dismissed'

function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() }
}

export default function Duplicates() {
  const [places, setPlaces] = useState([])
  const [reviewCounts, setReviewCounts] = useState({})
  const [reviewsKnown, setReviewsKnown] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [minLevel, setMinLevel] = useState(2)
  const [keepers, setKeepers] = useState({}) // groupKey -> place id chosen by the admin
  const [marks, setMarks] = useState({}) // place id -> true/false chosen by the admin
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [confirm, setConfirm] = useState(null) // { ids, title, message }
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [result, setResult] = useState('')
  const cancelRef = useRef(false)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [p, counts] = await Promise.all([fetchPlacesForDedupe(), fetchReviewCountsByPlace()])
      setPlaces(p)
      setReviewsKnown(counts !== null)
      setReviewCounts(counts || {})
    } catch (err) {
      setLoadError(err.message || 'Could not load places.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const groups = useMemo(
    () => findDuplicateGroups(places, reviewCounts, minLevel).filter((g) => !dismissed.has(g.key)),
    [places, reviewCounts, minLevel, dismissed],
  )

  const keeperOf = (g) => (g.members.some((m) => m.id === keepers[g.key]) ? keepers[g.key] : g.keeperId)
  // A copy is ticked for deletion by default only if it is not the keeper and has no reviews.
  const isMarked = (g, id) => {
    if (id === keeperOf(g)) return false
    return id in marks ? marks[id] : (reviewCounts[id] || 0) === 0
  }
  const idsToDelete = (g) => g.members.filter((m) => isMarked(g, m.id)).map((m) => m.id)

  const totalMarked = groups.reduce((n, g) => n + idsToDelete(g).length, 0)

  const dismiss = (g) => {
    const next = new Set(dismissed)
    next.add(g.key)
    setDismissed(next)
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
  }
  const resetDismissed = () => {
    setDismissed(new Set())
    try { localStorage.removeItem(DISMISSED_KEY) } catch { /* ignore */ }
  }

  const runDelete = async (ids) => {
    setConfirm(null)
    setBusy(true)
    setResult('')
    cancelRef.current = false
    setCancelling(false)
    setProgress({ done: 0, total: ids.length })
    let ok = 0
    const failed = []
    for (const id of ids) {
      if (cancelRef.current) break
      try {
        await deleteDuplicatePlace(id)
        ok += 1
      } catch (err) {
        failed.push(err.message)
      }
      setProgress({ done: ok + failed.length, total: ids.length })
    }
    setProgress(null)
    setBusy(false)
    setCancelling(false)
    const parts = [`Deleted ${ok} place${ok === 1 ? '' : 's'}.`]
    if (cancelRef.current) parts.push('Stopped before finishing.')
    if (failed.length) parts.push(`${failed.length} failed: ${failed[0]}`)
    setResult(parts.join(' '))
    load()
  }

  const askDeleteGroup = (g) => {
    const ids = idsToDelete(g)
    if (!ids.length) return
    const withReviews = ids.filter((id) => (reviewCounts[id] || 0) > 0).length
    setConfirm({
      ids,
      title: `Delete ${ids.length} duplicate${ids.length === 1 ? '' : 's'} of "${g.members.find((m) => m.id === keeperOf(g))?.name}"?`,
      message: withReviews
        ? `${withReviews} of them have reviews, which will be removed with them. This cannot be undone.`
        : 'The copy you chose to keep stays. This cannot be undone.',
    })
  }

  const askDeleteAll = () => {
    const ids = groups.flatMap(idsToDelete)
    if (!ids.length) return
    setConfirm({
      ids,
      title: `Delete ${ids.length} place${ids.length === 1 ? '' : 's'} across ${groups.length} group${groups.length === 1 ? '' : 's'}?`,
      message: 'In every group the copy marked "Keep" stays, and copies that have reviews are only deleted if you ticked them yourself. This cannot be undone.',
    })
  }

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—')

  return (
    <AdminLayout title="Duplicates">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Duplicate places</h1>
          <p>
            Finds places that look like the same business. In each group, pick the copy to <strong>Keep</strong>,
            tick the ones to remove, and delete. Copies that have reviews are never ticked automatically.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Sensitivity{' '}
          <select value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} disabled={busy}>
            {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <span className="muted">
          {loading ? 'Scanning…' : `${places.length} places scanned · ${groups.length} group${groups.length === 1 ? '' : 's'} found`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {dismissed.size > 0 && (
            <button className="btn-ghost btn-small" onClick={resetDismissed} disabled={busy}>
              Show {dismissed.size} hidden
            </button>
          )}
          <button className="btn-ghost btn-small" onClick={load} disabled={busy || loading}>Rescan</button>
          {busy ? (
            <>
              {progress && <span className="muted">{progress.done}/{progress.total}</span>}
              <button className="btn-danger btn-small" disabled={cancelling} onClick={() => { cancelRef.current = true; setCancelling(true) }}>
                {cancelling ? 'Stopping…' : 'Stop'}
              </button>
            </>
          ) : (
            <button className="btn-danger btn-small" onClick={askDeleteAll} disabled={totalMarked === 0}>
              Delete all ticked ({totalMarked})
            </button>
          )}
        </div>
      </div>

      {!reviewsKnown && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          Couldn't read review counts, so "Keep" suggestions ignore reviews. Check each group before deleting.
        </p>
      )}
      {loadError && <p className="error-text" style={{ marginBottom: 12 }}>{loadError}</p>}
      {result && <p style={{ marginBottom: 12 }}>{result}</p>}

      {loading ? (
        <div className="card"><p>Scanning places…</p></div>
      ) : groups.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            No duplicates found at this sensitivity.{minLevel > 1 ? ' Try "Include possible matches".' : ''}
          </div>
        </div>
      ) : (
        groups.map((g) => {
          const keeperId = keeperOf(g)
          const del = idsToDelete(g)
          return (
            <div className="card" key={g.key} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="badge-pill">{LEVEL_LABEL[g.level]}</span>
                <span className="muted">{g.reasons.join(' · ')}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn-ghost btn-small" disabled={busy} onClick={() => dismiss(g)}>Not duplicates</button>
                  <button className="btn-danger btn-small" disabled={busy || del.length === 0} onClick={() => askDeleteGroup(g)}>
                    Delete ticked ({del.length})
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Keep</th><th></th><th>Name</th><th>Category</th><th>Area / address</th>
                      <th>Reviews</th><th>Google</th><th>Added</th><th>Map</th><th>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.members.map((m) => {
                      const reviews = reviewCounts[m.id] || 0
                      const isKeeper = m.id === keeperId
                      return (
                        <tr key={m.id} style={isKeeper ? { background: 'rgba(34,197,94,0.08)' } : undefined}>
                          <td>
                            <input
                              type="radio"
                              name={`keep-${g.key}`}
                              checked={isKeeper}
                              disabled={busy}
                              onChange={() => setKeepers((k) => ({ ...k, [g.key]: m.id }))}
                            />
                          </td>
                          <td>
                            {m.cover_image_url
                              ? <img src={m.cover_image_url} alt="" className="place-thumb" />
                              : <span className="muted">—</span>}
                          </td>
                          <td>
                            {m.name}
                            <div className="muted" style={{ fontSize: 12 }}>{m.slug}</div>
                          </td>
                          <td>{m.category || '—'}</td>
                          <td style={{ maxWidth: 220 }}>
                            {m.neighborhood || '—'}
                            {m.address && <div className="muted" style={{ fontSize: 12 }}>{m.address}</div>}
                          </td>
                          <td>{reviewsKnown ? reviews : '?'}</td>
                          <td>{m.google_rating ? `${Number(m.google_rating).toFixed(1)} ★ (${m.google_rating_count ?? '—'})` : '—'}</td>
                          <td>{fmtDate(m.created_at)}</td>
                          <td>
                            {m.google_maps_url
                              ? <a href={m.google_maps_url} target="_blank" rel="noopener noreferrer" title="Open in Google Maps">📍</a>
                              : <span className="muted">—</span>}
                          </td>
                          <td>
                            {isKeeper ? (
                              <span className="muted">Keeping</span>
                            ) : (
                              <label title={reviews > 0 ? `Has ${reviews} review(s) — deleting removes them too` : ''}>
                                <input
                                  type="checkbox"
                                  checked={isMarked(g, m.id)}
                                  disabled={busy}
                                  onChange={(e) => setMarks((mk) => ({ ...mk, [m.id]: e.target.checked }))}
                                />
                                {reviews > 0 && <span className="error-text" style={{ fontSize: 12 }}> has reviews</span>}
                              </label>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Delete"
          danger
          onConfirm={() => runDelete(confirm.ids)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminLayout>
  )
}
