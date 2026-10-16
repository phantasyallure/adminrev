import { useEffect, useRef, useState } from 'react'
import AdminLayout from '../components/AdminLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAdminAuth } from '../context/AdminAuthContext'
import { buildImportBatches, ACCEPT } from '../lib/importFiles'
import {
  stagePlaceImports, fetchPlaceImports,
  updatePlaceImport, deletePlaceImport, publishPlaceImport, skipPlaceImport, uploadPlacePhoto,
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
  const [parseStatus, setParseStatus] = useState('')
  const [warnings, setWarnings] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [publishingId, setPublishingId] = useState(null)
  const [publishingAll, setPublishingAll] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [uploadingPhotoId, setUploadingPhotoId] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [publishingSelected, setPublishingSelected] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total } while a bulk publish runs
  const [cancelling, setCancelling] = useState(false)
  const cancelRef = useRef(false)
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false)
  const fileInput = useRef(null)
  const folderInput = useRef(null)
  const photoInputs = useRef({})

  const load = () => {
    setLoading(true)
    fetchPlaceImports({ status }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(load, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected(new Set()) }, [status])

  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && !allSelected

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }
  const toggleSelectOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const processFiles = async (files) => {
    if (!files || !files.length) return
    setUploadError('')
    setWarnings([])
    setParsing(true)
    try {
      const { batches, warnings: warn } = await buildImportBatches(files, setParseStatus)
      setWarnings(warn)
      const total = batches.reduce((n, b) => n + b.rows.length, 0)
      if (!total) {
        setUploadError('Nothing to import. Add a spreadsheet with a "Name" column, or some photos.')
        return
      }
      setParseStatus('Saving to the review queue…')
      for (const b of batches) {
        await stagePlaceImports(b.rows, { batchLabel: b.label, createdBy: user?.id })
      }
      setStatus('pending')
      load()
    } catch (err) {
      setUploadError(err.message || 'Could not read those files.')
    } finally {
      setParsing(false)
      setParseStatus('')
      if (fileInput.current) fileInput.current.value = ''
      if (folderInput.current) folderInput.current.value = ''
    }
  }

  const handleFile = (e) => processFiles(Array.from(e.target.files || []))

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (!parsing) processFiles(Array.from(e.dataTransfer.files || []))
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

  // Publishes rows one by one. Checks the cancel flag between rows, so pressing
  // Stop lets the row currently being published finish and skips the rest.
  const runPublishQueue = async (targets) => {
    cancelRef.current = false
    setCancelling(false)
    setProgress({ done: 0, total: targets.length })
    let done = 0
    for (const row of targets) {
      if (cancelRef.current) break
      try {
        await publishPlaceImport(row, session?.access_token)
      } catch {
        // keep going — failed rows stay pending with an error message attached
      }
      done += 1
      setProgress({ done, total: targets.length })
    }
    setProgress(null)
    setCancelling(false)
    cancelRef.current = false
  }

  const handleCancelPublish = () => {
    cancelRef.current = true
    setCancelling(true)
  }

  const handlePublishAll = async () => {
    setPublishingAll(true)
    await runPublishQueue(rows.filter((r) => r.status === 'pending'))
    setPublishingAll(false)
    load()
  }

  const handleFieldSave = async (row, field, value) => {
    let patch
    if (field === 'keywords') {
      patch = { keywords: value.split(',').map((k) => k.trim()).filter(Boolean) }
    } else if (field === 'lat' || field === 'lng') {
      const n = value === '' ? null : Number(value)
      patch = { [field]: Number.isFinite(n) ? n : null }
    } else {
      patch = { [field]: value }
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
    try {
      await updatePlaceImport(row.id, patch)
    } catch (err) {
      console.error(err)
      load()
    }
  }

  const confirmDelete = async () => {
    setUploadError('')
    try {
      await deletePlaceImport(pendingDelete)
    } catch (err) {
      setUploadError(err.message || 'Could not delete that row.')
    }
    setPendingDelete(null)
    load()
  }

  const handlePublishSelected = async () => {
    setPublishingSelected(true)
    await runPublishQueue(rows.filter((r) => selected.has(r.id) && r.status === 'pending'))
    setPublishingSelected(false)
    setSelected(new Set())
    load()
  }

  const confirmBulkDelete = async () => {
    setBulkBusy(true)
    setUploadError('')
    let failed = 0
    let lastMessage = ''
    for (const id of selected) {
      try {
        await deletePlaceImport(id)
      } catch (err) {
        console.error(err)
        failed += 1
        lastMessage = err.message
      }
    }
    if (failed) setUploadError(`${failed} row${failed === 1 ? '' : 's'} could not be deleted. ${lastMessage}`)
    setBulkBusy(false)
    setPendingBulkDelete(false)
    setSelected(new Set())
    load()
  }

  const handlePhotoFile = async (row, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhotoId(row.id)
    try {
      const url = await uploadPlacePhoto(file)
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, hosted_photo_url: url } : r)))
      await updatePlaceImport(row.id, { hosted_photo_url: url })
    } catch (err) {
      console.error(err)
      setUploadError(err.message || 'Photo upload failed.')
    } finally {
      setUploadingPhotoId(null)
      if (photoInputs.current[row.id]) photoInputs.current[row.id].value = ''
    }
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length

  return (
    <AdminLayout title="Import">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Bulk import from Google Maps</h1>
          <p>Upload a spreadsheet, photos, a ZIP or a whole folder, check the places over, then publish.</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Spreadsheet columns: Name, Category, Neighborhood, Address, Keywords (comma-separated), Google Maps Link,
            Google Rating, Google Rating Count, Photo URL, Latitude, Longitude. Only Name is required — but a row with
            no Latitude/Longitude and no address a geocoder can read will publish with no location, so fix those
            before publishing rather than after.
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            Photos: put the image file name in the Photo URL column (e.g. <code>cafe-oran.jpg</code>), or name each
            image after its place. Upload the spreadsheet and photos together, or as one ZIP / folder. Photos with no
            spreadsheet become one place each, named from the file name.
          </p>
        </div>
      </div>

      <div
        className="card"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          marginBottom: 12, padding: 20, textAlign: 'center',
          border: `2px dashed ${dragOver ? 'var(--primary, #6366f1)' : 'var(--border, #d4d4d8)'}`,
        }}
      >
        <p style={{ marginBottom: 10 }}>Drop files here, or</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary btn-small" disabled={parsing} onClick={() => fileInput.current?.click()}>
            Choose files
          </button>
          <button className="btn-ghost btn-small" disabled={parsing} onClick={() => folderInput.current?.click()}>
            Choose folder
          </button>
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} onChange={handleFile} style={{ display: 'none' }} />
        <input ref={folderInput} type="file" webkitdirectory="" directory="" multiple onChange={handleFile} style={{ display: 'none' }} />
        <p className="muted" style={{ marginTop: 10 }}>
          {parsing ? (parseStatus || 'Working…') : '.xlsx, .xls, .csv, .zip, .jpg, .png, .webp'}
        </p>
      </div>

      {uploadError && <p className="error-text" style={{ marginBottom: 12 }}>{uploadError}</p>}
      {warnings.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: 12 }}>
          <strong>Imported, with notes:</strong>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {warnings.map((w, i) => <li key={i} className="muted">{w}</li>)}
          </ul>
        </div>
      )}

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selected.size > 0 && (
            <>
              <span className="muted">{selected.size} selected</span>
              {status === 'pending' && (
                <button className="btn-primary btn-small" onClick={handlePublishSelected} disabled={bulkBusy || publishingAll || publishingSelected}>
                  {publishingSelected ? 'Publishing…' : `Publish selected (${selected.size})`}
                </button>
              )}
              <button className="btn-danger btn-small" onClick={() => setPendingBulkDelete(true)} disabled={bulkBusy}>
                Delete selected ({selected.size})
              </button>
            </>
          )}
          {status === 'pending' && pendingCount > 0 && (
            <button className="btn-primary btn-small" onClick={handlePublishAll} disabled={publishingAll || publishingSelected}>
              {publishingAll ? 'Publishing…' : `Publish all pending (${pendingCount})`}
            </button>
          )}
          {(publishingAll || publishingSelected) && (
            <>
              {progress && <span className="muted">{progress.done}/{progress.total}</span>}
              <button className="btn-danger btn-small" onClick={handleCancelPublish} disabled={cancelling}>
                {cancelling ? 'Stopping after this row…' : 'Stop publishing'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            {status === 'pending' ? 'Nothing staged — drop a spreadsheet and/or photos above to get started.' : `No ${status} imports.`}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th></th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Neighborhood</th>
                  <th>Keywords</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Map</th>
                  <th>Google rating</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelectOne(r.id)}
                      />
                    </td>
                    <td>
                      <input
                        ref={(el) => { photoInputs.current[r.id] = el }}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handlePhotoFile(r, e)}
                      />
                      <div
                        onClick={() => photoInputs.current[r.id]?.click()}
                        title="Click to upload a photo"
                        style={{ position: 'relative', cursor: 'pointer', width: 40, height: 40 }}
                      >
                        <img
                          src={r.hosted_photo_url || r.photo_url || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + r.id}
                          alt=""
                          className="place-thumb"
                          style={{ opacity: uploadingPhotoId === r.id ? 0.4 : 1 }}
                        />
                        {uploadingPhotoId === r.id && (
                          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                            …
                          </span>
                        )}
                      </div>
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
                      <input
                        defaultValue={r.lat ?? ''}
                        onBlur={(e) => handleFieldSave(r, 'lat', e.target.value)}
                        placeholder="35.69…"
                        style={{ width: 90, borderColor: r.lat == null ? undefined : undefined }}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={r.lng ?? ''}
                        onBlur={(e) => handleFieldSave(r, 'lng', e.target.value)}
                        placeholder="-0.63…"
                        style={{ width: 90 }}
                      />
                      {(r.lat == null || r.lng == null) && (
                        <div
                          className="badge-pill badge-rejected"
                          style={{ marginTop: 4, display: 'inline-block' }}
                          title="No coordinates typed in — will fall back to reading the address on publish, which fails for Plus Codes/cooperative-style addresses"
                        >
                          No coords set
                        </div>
                      )}
                    </td>
                    <td>
                      {r.google_maps_url ? (
                        <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
                          📍
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
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

      {pendingBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selected.size} staged row${selected.size === 1 ? '' : 's'}?`}
          message="This only removes them from the import queue — nothing published from them is affected."
          confirmLabel="Delete"
          danger
          onConfirm={confirmBulkDelete}
          onCancel={() => setPendingBulkDelete(false)}
        />
      )}
    </AdminLayout>
  )
}
