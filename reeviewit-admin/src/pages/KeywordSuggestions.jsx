import { useEffect, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'
import {
  fetchKeywordSuggestions, approveKeywordSuggestion, rejectKeywordSuggestion, scanAllPlacesForKeywords,
} from '../lib/adminApi'

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

export default function KeywordSuggestions() {
  const { session } = useAdminAuth()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState({}) // { [suggestionId]: Set<keyword> }
  const [selected, setSelected] = useState(() => new Set()) // suggestion ids selected for bulk actions
  const [savingId, setSavingId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(null)
  const [scanResult, setScanResult] = useState(null)

  const load = () => {
    setLoading(true)
    fetchKeywordSuggestions({ status })
      .then((data) => {
        setRows(data)
        setChecked(Object.fromEntries(data.map((r) => [r.id, new Set(r.suggested_keywords)])))
        setSelected(new Set())
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }
  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectableRows = rows.filter((r) => r.suggested_keywords?.length)
  const allSelected = selectableRows.length > 0 && selected.size === selectableRows.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.id)))
  }
  const toggleSelectOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleKeyword = (rowId, kw) => {
    setChecked((prev) => {
      const next = new Set(prev[rowId])
      if (next.has(kw)) next.delete(kw)
      else next.add(kw)
      return { ...prev, [rowId]: next }
    })
  }

  const handleApprove = async (row) => {
    const chosen = Array.from(checked[row.id] || [])
    if (!chosen.length) return
    setSavingId(row.id)
    try {
      await approveKeywordSuggestion(row, chosen)
      load()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingId(null)
    }
  }

  const handleReject = async (row) => {
    setSavingId(row.id)
    try {
      await rejectKeywordSuggestion(row.id)
      load()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingId(null)
    }
  }

  // Approves every selected row using whichever keywords are currently
  // checked for it (unchecking a keyword before bulk-approving still
  // excludes just that one, same as approving one row at a time).
  const handleApproveSelected = async () => {
    setBulkBusy(true)
    const targets = rows.filter((r) => selected.has(r.id) && checked[r.id]?.size)
    for (const row of targets) {
      try {
        await approveKeywordSuggestion(row, Array.from(checked[row.id]))
      } catch (err) {
        console.error(err)
      }
    }
    setBulkBusy(false)
    load()
  }

  const handleRejectSelected = async () => {
    setBulkBusy(true)
    for (const id of selected) {
      try {
        await rejectKeywordSuggestion(id)
      } catch (err) {
        console.error(err)
      }
    }
    setBulkBusy(false)
    load()
  }

  const handleScanAll = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const result = await scanAllPlacesForKeywords(session?.access_token, setScanProgress)
      setScanResult(result)
      if (status === 'pending') load()
    } catch (err) {
      console.error(err)
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }

  return (
    <AdminLayout title="Keyword suggestions">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>AI keyword suggestions</h1>
          <p>
            Scans every place's name, category, and cover photo to suggest extra search keywords —
            cuisine descriptors and vibe/use-case tags like "date spot" or "quick bite" — beyond what
            was typed in when the place was added. Nothing is added to a place until you approve it here.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button className="btn-primary btn-small" onClick={handleScanAll} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan all places'}
          </button>
          {scanning && scanProgress && (
            <span className="muted" style={{ fontSize: 12 }}>
              {scanProgress.done} / {scanProgress.total} scanned
              {scanProgress.failed ? ` (${scanProgress.failed} failed)` : ''}
            </span>
          )}
          {!scanning && scanResult && (
            <span className="muted" style={{ fontSize: 12 }}>
              Done — {scanResult.succeeded} scanned, {scanResult.failed} failed.
            </span>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab${status === t.key ? ' active' : ''}`} onClick={() => setStatus(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {status === 'pending' && selected.size > 0 && (
        <div className="page-head" style={{ marginBottom: 12 }}>
          <span className="muted">{selected.size} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary btn-small" onClick={handleApproveSelected} disabled={bulkBusy}>
              {bulkBusy ? 'Approving…' : `Approve selected (${selected.size})`}
            </button>
            <button className="btn-danger btn-small" onClick={handleRejectSelected} disabled={bulkBusy}>
              {bulkBusy ? 'Rejecting…' : `Reject selected (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {status === 'pending' ? 'Nothing to review — try "Scan all places".' : `No ${status} suggestions.`}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {status === 'pending' && (
                    <th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        title="Select all rows with suggestions"
                      />
                    </th>
                  )}
                  <th>Photo</th>
                  <th>Place</th>
                  <th>Existing keywords</th>
                  <th>Suggested keywords</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {status === 'pending' && (
                      <td>
                        {r.suggested_keywords?.length ? (
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleSelectOne(r.id)}
                          />
                        ) : null}
                      </td>
                    )}
                    <td>
                      {r.place?.cover_image_url ? (
                        <img
                          src={r.place.cover_image_url}
                          alt=""
                          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.place?.name || <span className="muted">Deleted place</span>}
                      <div className="muted">{r.place?.category} · {r.place?.neighborhood}</div>
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      {(r.place?.keywords || []).join(', ') || <span className="muted">—</span>}
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {r.error && !r.suggested_keywords?.length ? (
                        <span className="error-text" style={{ fontSize: 12 }}>{r.error}</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(r.suggested_keywords || []).map((kw) => (
                            <label
                              key={kw}
                              className="badge-pill"
                              style={{
                                cursor: status === 'pending' ? 'pointer' : 'default',
                                opacity: status === 'pending' && !checked[r.id]?.has(kw) ? 0.4 : 1,
                                userSelect: 'none',
                              }}
                            >
                              {status === 'pending' && (
                                <input
                                  type="checkbox"
                                  checked={checked[r.id]?.has(kw) ?? false}
                                  onChange={() => toggleKeyword(r.id, kw)}
                                  style={{ marginRight: 4 }}
                                />
                              )}
                              {kw}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn-primary btn-small"
                            disabled={savingId === r.id || !checked[r.id]?.size}
                            onClick={() => handleApprove(r)}
                          >
                            Approve
                          </button>
                          <button
                            className="btn-danger btn-small"
                            disabled={savingId === r.id}
                            onClick={() => handleReject(r)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
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
