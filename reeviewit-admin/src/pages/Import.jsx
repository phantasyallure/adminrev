import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import {
  mapImportSheetRows, stagePlaceImports, fetchPlaceImports,
  updatePlaceImport, deletePlaceImport, publishPlaceImport, skipPlaceImport,
} from '../lib/adminApi'

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'published', label: 'Published' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'all', label: 'All' },
]

export default function Import() {
  const { user, session } = useAdminAuth()
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [publishingId, setPublishingId] = useState(null)
  const [publishingAll, setPublishingAll] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const fileInput = useRef(null)

  const load = () => {
    setLoading(true)
    fetchPlaceImports({ status }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })
      const mapped = mapImportSheetRows(raw)
      if (!mapped.length) {
        setUploadError('No usable rows found. Make sure the sheet has a "Name" column.')
        return
      }
      await stagePlaceImports(mapped, { batchLabel: file.name, createdBy: user?.id })
      setStatus('pending')
      load()
    } catch (err) {
      setUploadError(err.message || 'Could not read that file.')
    } finally {
      setParsing(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handlePublish = async (row) => {
    setPublishingId(row.id)
    try {
      await publishPlaceImport(row, session?.access_token)
      load()
    } catch (err) {
      load() // pick up the error message that got saved on the row
    } finally {
      setPublishingId(null)
    }
  }

  const handlePublishAll = async () => {
    setPublishingAll(true)
    const pending = rows.filter((r) => r.status === 'pending' || (status === 'pending'))
    for (const row of pending) {
      try {
        await publishPlaceImport(row, session?.access_token)
      } catch {
        // keep going — failed rows stay pending with an error message attached
      }
    }
    setPublishingAll(false)
    load()
  }

  const handleFieldSave = async (row, field, value) => {
    const patch = field === 'keywords'
      ? { keywords: value.split(',').map((k) => k.trim()).filter(Boolean) }
      : { [field]: value }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
    try {
      await updatePlaceImport(row.id, patch)
    } catch (err) {
      console.error(err)
      load()
    }
  }

  const confirmDelete = async () => {
    await deletePlaceImport(pendingDelete)
    setPendingDelete(null)
    load()
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length

  return (
    <AdminLayout title="Import">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Bulk import from Google Maps</h1>
          <p>Upload an Excel sheet of scraped places, check them over, then publish.</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Columns: Name, Category, Neighborhood, Address, Keywords (comma-separated), Google Maps Link,
            Google Rating, Google Rating Count, Photo URL. Only Name is required.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={parsing} />
          {parsing && <span className="muted">Reading file…</span>}
        </div>
      </div>

      {uploadError && <p className="error-text" style={{ marginBottom: 12 }}>{uploadError}</p>}

      <div className="page-head" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={status === t.key ? 'btn-primary btn-small' : 'btn-ghost btn-small'}
              onClick={() => setStatus(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {status === 'pending' && pendingCount > 0 && (
          <button className="btn-primary btn-small" onClick={handlePublishAll} disabled={publishingAll}>
            {publishingAll ? 'Publishing…' : `Publish all pending (${pendingCount})`}
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {status === 'pending' ? 'Nothing staged — upload an Excel file to get started.' : `No ${status} imports.`}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Neighborhood</th>
                  <th>Keywords</th>
                  <th>Google rating</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <img
                        src={r.hosted_photo_url || r.photo_url || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + r.id}
                        alt=""
                        className="place-thumb"
                      />
                    </td>
                    <td>
                      {editingId === r.id ? (
                        <input
                          defaultValue={r.name}
                          onBlur={(e) => handleFieldSave(r, 'name', e.target.value)}
                          style={{ width: 140 }}
                        />
                      ) : (
                        <span onClick={() => setEditingId(r.id)} style={{ cursor: 'text' }}>{r.name}</span>
                      )}
                      {r.error && <div className="error-text" style={{ fontSize: 12 }}>{r.error}</div>}
                    </td>
                    <td>
                      <input
                        defaultValue={r.category || ''}
                        onBlur={(e) => handleFieldSave(r, 'category', e.target.value)}
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={r.neighborhood || ''}
                        onBlur={(e) => handleFieldSave(r, 'neighborhood', e.target.value)}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <input
                        defaultValue={(r.keywords || []).join(', ')}
                        onBlur={(e) => handleFieldSave(r, 'keywords', e.target.value)}
                        placeholder="grilled, terrace…"
                        style={{ width: 160 }}
                      />
                    </td>
                    <td>
                      {r.google_rating ? `${Number(r.google_rating).toFixed(1)} ★ (${r.google_rating_count ?? '—'})` : <span className="muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {r.status === 'pending' && (
                          <>
                            <button
                              className="btn-primary btn-small"
                              disabled={publishingId === r.id}
                              onClick={() => handlePublish(r)}
                            >
                              {publishingId === r.id ? 'Publishing…' : 'Publish'}
                            </button>
                            <button className="btn-ghost btn-small" onClick={() => skipPlaceImport(r.id).then(load)}>Skip</button>
                          </>
                        )}
                        <button className="btn-danger btn-small" onClick={() => setPendingDelete(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this staged row?"
          message="This only removes it from the import queue — nothing was published from it."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </AdminLayout>
  )
}
