import { useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  fetchPlacesForPhotoReview, fetchReviewCountsByPlace, deleteDuplicatePlace, clearPlaceCoverPhotos,
} from '../lib/adminApi'

const PAGE_SIZE = 48
const AGE_OPTIONS = [
  { value: 0, label: 'Any time' },
  { value: 1, label: 'Added in the last day' },
  { value: 7, label: 'Added in the last 7 days' },
  { value: 30, label: 'Added in the last 30 days' },
]

export default function PhotoReview() {
  const [places, setPlaces] = useState([])
  const [reviewCounts, setReviewCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('photo') // photo | nophoto
  const [ageDays, setAgeDays] = useState(0)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(() => new Set())
  const [broken, setBroken] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null) // { kind: 'delete' | 'clear', ids }
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [result, setResult] = useState('')
  const cancelRef = useRef(false)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [p, counts] = await Promise.all([fetchPlacesForPhotoReview(), fetchReviewCountsByPlace()])
      setPlaces(p)
      setReviewCounts(counts || {})
    } catch (err) {
      setLoadError(err.message || 'Could not load places.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const withPhoto = useMemo(() => places.filter((p) => p.cover_image_url), [places])
  const withoutPhoto = useMemo(() => places.filter((p) => !p.cover_image_url), [places])

  const filtered = useMemo(() => {
    const base = tab === 'photo' ? withPhoto : withoutPhoto
    if (!ageDays) return base
    const cutoff = Date.now() - ageDays * 86400000
    return base.filter((p) => new Date(p.created_at).getTime() >= cutoff)
  }, [tab, withPhoto, withoutPhoto, ageDays])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectPage = () => setSelected((prev) => new Set([...prev, ...visible.map((p) => p.id)]))
  const clearSelection = () => setSelected(new Set())

  const selectedIds = [...selected]
  const selectedWithPhoto = selectedIds.filter((id) => places.find((p) => p.id === id)?.cover_image_url)
  const selectedWithReviews = selectedIds.filter((id) => (reviewCounts[id] || 0) > 0)

  const changeTab = (t) => { setTab(t); setPage(0); setSelected(new Set()) }
  const changeAge = (v) => { setAgeDays(v); setPage(0) }

  const run = async (kind, ids) => {
    setConfirm(null)
    setBusy(true)
    setResult('')
    cancelRef.current = false
    setCancelling(false)
    let okCount = 0
    const failed = []
    if (kind === 'clear') {
      setProgress({ done: 0, total: ids.length })
      try {
        await clearPlaceCoverPhotos(ids)
        okCount = ids.length
      } catch (err) {
        failed.push(err.message)
      }
    } else {
      setProgress({ done: 0, total: ids.length })
      for (const id of ids) {
        if (cancelRef.current) break
        try {
          await deleteDuplicatePlace(id)
          okCount += 1
        } catch (err) {
          failed.push(err.message)
        }
        setProgress({ done: okCount + failed.length, total: ids.length })
      }
    }
    const parts = [kind === 'clear'
      ? `Removed the photo from ${okCount} place${okCount === 1 ? '' : 's'} (they now show the category picture).`
      : `Deleted ${okCount} place${okCount === 1 ? '' : 's'}.`]
    if (cancelRef.current) parts.push('Stopped before finishing.')
    if (failed.length) parts.push(`${failed.length} failed: ${failed[0]}`)
    setResult(parts.join(' '))
    setProgress(null)
    setBusy(false)
    setSelected(new Set())
    load()
  }

  const ask = (kind) => {
    const ids = kind === 'clear' ? selectedWithPhoto : selectedIds
    if (ids.length) setConfirm({ kind, ids })
  }

  const confirmText = () => {
    if (!confirm) return {}
    const n = confirm.ids.length
    if (confirm.kind === 'clear') {
      return {
        title: `Remove the photo from ${n} place${n === 1 ? '' : 's'}?`,
        message: 'The places stay on the site and will show their category picture instead.',
      }
    }
    const withReviews = confirm.ids.filter((id) => (reviewCounts[id] || 0) > 0).length
    return {
      title: `Delete ${n} place${n === 1 ? '' : 's'}?`,
      message: withReviews
        ? `${withReviews} of them have reviews, which are deleted with them. This cannot be undone.`
        : 'This cannot be undone.',
    }
  }

  return (
    <AdminLayout title="Photo review">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Photo review</h1>
          <p>
            Look through the cover photos and click the ones that don't belong (a garage, a street, a wrong
            business). Then either <strong>delete the places</strong> or <strong>remove just the photo</strong> so the
            place shows its category picture. Places with no photo already show the category picture on the site.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={tab === 'photo' ? 'btn-primary btn-small' : 'btn-ghost btn-small'} onClick={() => changeTab('photo')} disabled={busy}>
          With a photo ({withPhoto.length})
        </button>
        <button className={tab === 'nophoto' ? 'btn-primary btn-small' : 'btn-ghost btn-small'} onClick={() => changeTab('nophoto')} disabled={busy}>
          No photo ({withoutPhoto.length})
        </button>
        <select value={ageDays} onChange={(e) => changeAge(Number(e.target.value))} disabled={busy}>
          {AGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="muted">{filtered.length} place{filtered.length === 1 ? '' : 's'}</span>
        <button className="btn-ghost btn-small" onClick={load} disabled={busy || loading} style={{ marginLeft: 'auto' }}>Reload</button>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 5 }}>
        <button className="btn-ghost btn-small" onClick={selectPage} disabled={busy || visible.length === 0}>Select this page</button>
        <button className="btn-ghost btn-small" onClick={clearSelection} disabled={busy || selected.size === 0}>Clear selection</button>
        <span className="muted">{selected.size} selected</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {busy ? (
            <>
              {progress && <span className="muted">{progress.done}/{progress.total}</span>}
              <button className="btn-danger btn-small" disabled={cancelling} onClick={() => { cancelRef.current = true; setCancelling(true) }}>
                {cancelling ? 'Stopping…' : 'Stop'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost btn-small" onClick={() => ask('clear')} disabled={selectedWithPhoto.length === 0}>
                Remove photos only ({selectedWithPhoto.length})
              </button>
              <button className="btn-danger btn-small" onClick={() => ask('delete')} disabled={selected.size === 0}>
                Delete places ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>

      {selectedWithReviews.length > 0 && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          {selectedWithReviews.length} selected place{selectedWithReviews.length === 1 ? ' has' : 's have'} reviews. Deleting them deletes the reviews too — "Remove photos only" keeps them.
        </p>
      )}
      {loadError && <p className="error-text" style={{ marginBottom: 12 }}>{loadError}</p>}
      {result && <p style={{ marginBottom: 12 }}>{result}</p>}

      {loading ? (
        <div className="card"><p>Loading places…</p></div>
      ) : visible.length === 0 ? (
        <div className="card"><div className="empty-state">Nothing here.</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {visible.map((p) => {
            const isSel = selected.has(p.id)
            const reviews = reviewCounts[p.id] || 0
            return (
              <div
                key={p.id}
                onClick={() => !busy && toggle(p.id)}
                role="checkbox"
                aria-checked={isSel}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!busy) toggle(p.id) } }}
                style={{
                  cursor: busy ? 'default' : 'pointer', borderRadius: 10, overflow: 'hidden', background: 'var(--card-bg, #fff)',
                  border: isSel ? '3px solid #dc2626' : '3px solid transparent', boxShadow: '0 1px 4px rgba(0,0,0,0.12)', position: 'relative',
                }}
              >
                <div style={{ aspectRatio: '4 / 3', background: '#e5e7eb', position: 'relative' }}>
                  {p.cover_image_url ? (
                    <img
                      src={p.cover_image_url}
                      alt={p.name}
                      loading="lazy"
                      onError={() => setBroken((b) => new Set(b).add(p.id))}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: isSel ? 0.55 : 1 }}
                    />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="muted">No photo</div>
                  )}
                  {isSel && (
                    <span style={{ position: 'absolute', top: 6, right: 6, background: '#dc2626', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                      ✕ remove
                    </span>
                  )}
                  {broken.has(p.id) && (
                    <span style={{ position: 'absolute', bottom: 6, left: 6, background: '#111827', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 11 }}>
                      photo won't load
                    </span>
                  )}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{p.category}{p.neighborhood ? ` · ${p.neighborhood}` : ''}</div>
                  {reviews > 0 && <div className="error-text" style={{ fontSize: 12 }}>{reviews} review{reviews === 1 ? '' : 's'}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', margin: '16px 0' }}>
          <button className="btn-ghost btn-small" disabled={safePage === 0 || busy} onClick={() => { setPage(safePage - 1); window.scrollTo({ top: 0 }) }}>← Previous</button>
          <span className="muted">Page {safePage + 1} of {pageCount}</span>
          <button className="btn-ghost btn-small" disabled={safePage >= pageCount - 1 || busy} onClick={() => { setPage(safePage + 1); window.scrollTo({ top: 0 }) }}>Next →</button>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          {...confirmText()}
          confirmLabel={confirm.kind === 'clear' ? 'Remove photos' : 'Delete'}
          danger={confirm.kind === 'delete'}
          onConfirm={() => run(confirm.kind, confirm.ids)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </AdminLayout>
  )
}
