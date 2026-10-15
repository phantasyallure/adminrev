// Turns whatever the admin drops on the Import page into staged place rows.
//
// Accepted, in any combination:
//   - spreadsheets (.xlsx / .xls / .csv)  -> one row per place
//   - images (jpg, png, webp, gif, avif)  -> photos
//   - .zip archives                        -> unpacked, their contents handled as above
//   - whole folders (via "Choose folder")  -> same as selecting every file inside
//
// Photo matching, per spreadsheet row:
//   1. If the "Photo URL" cell is a real http(s) link, it is left alone (the
//      existing server-side re-host at publish time handles it).
//   2. If the cell holds a file name (e.g. "cafe-oran.jpg" or "photos/cafe-oran.jpg"),
//      the image with that name is used.
//   3. If the cell is empty, an image named after the place (e.g. "Cafe Oran.jpg") is used.
//
// If there is NO spreadsheet, every image becomes its own row, named from the file name,
// so you can bulk-add places and fill in category/coordinates in the review table.
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { mapImportSheetRows, uploadPlacePhoto } from './adminApi'

const SHEET_EXT = ['xlsx', 'xls', 'csv']
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

export const ACCEPT = '.xlsx,.xls,.csv,.zip,.jpg,.jpeg,.png,.webp,.gif,.avif'

const extOf = (name) => (name.split('.').pop() || '').toLowerCase()
const baseOf = (path) => String(path).split(/[\\/]/).pop()
const stem = (name) => baseOf(name).replace(/\.[^.]+$/, '')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
// "cafe_1" / "cafe (2)" / "cafe-03" -> "cafe"
const normNoSuffix = (s) => norm(String(s).replace(/[\s_\-]*\(?\d+\)?\s*$/, ''))

function isJunk(path) {
  const parts = path.split(/[\\/]/)
  return parts.some((p) => p === '__MACOSX' || p.startsWith('.')) || path.endsWith('/')
}

// Flattens files + zips into { sheets: File[], images: File[], skipped: string[] }
export async function classifyFiles(fileList) {
  const sheets = []
  const images = []
  const skipped = []

  const handle = (file) => {
    const ext = extOf(file.name)
    if (SHEET_EXT.includes(ext)) sheets.push(file)
    else if (IMAGE_EXT.includes(ext) || file.type.startsWith('image/')) images.push(file)
    else skipped.push(file.name)
  }

  for (const file of Array.from(fileList)) {
    if (extOf(file.name) === 'zip') {
      const zip = await JSZip.loadAsync(file)
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || isJunk(path)) continue
        const ext = extOf(path)
        if (!SHEET_EXT.includes(ext) && !IMAGE_EXT.includes(ext)) { skipped.push(path); continue }
        const blob = await entry.async('blob')
        handle(new File([blob], baseOf(path), { type: MIME[ext] || blob.type }))
      }
    } else if (!isJunk(file.webkitRelativePath || file.name)) {
      handle(file)
    }
  }
  return { sheets, images, skipped }
}

// Pure matching helper (exported for testing).
export function findImage(row, imageIndex) {
  const raw = (row.photo_url || '').trim()
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return { kind: 'url' }
    const byName = imageIndex.byName.get(baseOf(raw).toLowerCase()) || imageIndex.byStem.get(norm(stem(raw)))
    return byName ? { kind: 'file', file: byName } : { kind: 'missing', ref: raw }
  }
  const key = norm(row.name)
  const hit = imageIndex.byStem.get(key) || imageIndex.byStemNoSuffix.get(key)
  return hit ? { kind: 'file', file: hit } : { kind: 'none' }
}

export function indexImages(images) {
  const byName = new Map()
  const byStem = new Map()
  const byStemNoSuffix = new Map()
  for (const f of images) {
    byName.set(f.name.toLowerCase(), f)
    const s = norm(stem(f.name))
    if (!byStem.has(s)) byStem.set(s, f)
    const s2 = normNoSuffix(stem(f.name))
    if (!byStemNoSuffix.has(s2)) byStemNoSuffix.set(s2, f)
  }
  return { byName, byStem, byStemNoSuffix }
}

export function nameFromFile(file) {
  return stem(file.name).replace(/[_]+/g, ' ').replace(/\s*\(\d+\)\s*$/, '').replace(/\s+/g, ' ').trim()
}

async function readSheet(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return mapImportSheetRows(XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }))
}

// Runs fn over items with limited concurrency.
async function pool(items, limit, fn) {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
}

// Returns { batches: [{ label, rows }], warnings: string[] }.
// Rows carry hosted_photo_url when a local image was matched and uploaded.
export async function buildImportBatches(fileList, onProgress = () => {}) {
  onProgress('Reading files…')
  const { sheets, images, skipped } = await classifyFiles(fileList)
  const warnings = []
  if (skipped.length) warnings.push(`Ignored ${skipped.length} unsupported file${skipped.length === 1 ? '' : 's'}: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`)

  const imageIndex = indexImages(images)
  const used = new Set()
  const batches = []

  if (sheets.length) {
    for (const file of sheets) {
      const rows = await readSheet(file)
      if (!rows.length) { warnings.push(`${file.name}: no usable rows (needs a "Name" column).`); continue }
      const missing = []
      for (const r of rows) {
        const m = findImage(r, imageIndex)
        if (m.kind === 'file') { r._file = m.file; used.add(m.file) }
        else if (m.kind === 'missing') { missing.push(m.ref); r.photo_url = null }
      }
      if (missing.length) warnings.push(`${file.name}: ${missing.length} photo file${missing.length === 1 ? '' : 's'} named in the sheet weren't included (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}).`)
      batches.push({ label: file.name, rows })
    }
    const unused = images.filter((f) => !used.has(f))
    if (unused.length) warnings.push(`${unused.length} image${unused.length === 1 ? '' : 's'} didn't match any place: ${unused.slice(0, 5).map((f) => f.name).join(', ')}${unused.length > 5 ? '…' : ''}`)
  } else if (images.length) {
    const rows = images.map((f) => ({ name: nameFromFile(f), _file: f })).filter((r) => r.name)
    batches.push({ label: `${images.length} photo${images.length === 1 ? '' : 's'}`, rows })
  }

  // Upload each distinct image once, then attach the hosted URL to every row using it.
  const toUpload = Array.from(new Set(batches.flatMap((b) => b.rows.map((r) => r._file).filter(Boolean))))
  const hosted = new Map()
  let done = 0
  await pool(toUpload, 3, async (file) => {
    try {
      hosted.set(file, await uploadPlacePhoto(file))
    } catch (err) {
      warnings.push(`Photo "${file.name}" failed to upload (${err.message || 'unknown error'}).`)
    }
    done += 1
    onProgress(`Uploading photos… ${done}/${toUpload.length}`)
  })
  for (const b of batches) {
    for (const r of b.rows) {
      if (r._file && hosted.has(r._file)) r.hosted_photo_url = hosted.get(r._file)
      delete r._file
    }
  }
  return { batches, warnings }
}
