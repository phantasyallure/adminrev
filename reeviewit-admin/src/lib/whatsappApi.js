// Everything for the standalone WhatsApp contacts page: phone cleanup,
// Excel parsing and the Supabase calls (table: public.wa_contacts).
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'

// "06 75 46 53 94" / "+213 666 75 90 59" -> { wa: '213675465394', kind: 'mobile' }
// Landlines (02/03/04) and incomplete numbers get no WhatsApp link.
export function parsePhone(raw) {
  if (!raw || !String(raw).trim()) return null
  let d = String(raw).replace(/\(.*?\)/g, '').replace(/\D/g, '')
  if (d.startsWith('213')) d = d.slice(3)
  else if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 9 && '567'.includes(d[0])) return { raw: String(raw).trim(), wa: `213${d}`, kind: 'mobile' }
  if (d.length === 9 && '234'.includes(d[0])) return { raw: String(raw).trim(), wa: null, kind: 'landline' }
  return { raw: String(raw).trim(), wa: null, kind: 'invalid' }
}

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const SKIP_SHEET = /closed|do not call|ferm/i

function pick(row, test, exclude) {
  const key = Object.keys(row).find((k) => test.test(k.trim()) && !(exclude && exclude.test(k.trim())))
  return key ? String(row[key] ?? '').trim() : ''
}

// Reads every sheet of an Excel file (sheets named "closed" / "do not call" are skipped).
export async function parseContactsFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const rows = []
  const skippedSheets = []
  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEET.test(sheetName)) { skippedSheets.push(sheetName); continue }
    const category = sheetName.replace(/\s*\(.*?\)/g, '').trim() || 'Other'
    const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
    for (const r of json) {
      const name = pick(r, /^(name|nom|restaurant)/i)
      if (!name) continue
      rows.push({
        name,
        category,
        cuisine: pick(r, /(type|cuisine)/i) || null,
        location: pick(r, /(location|address|adresse)/i) || null,
        phone: pick(r, /(phone|t[eé]l|num)/i, /alt/i) || null,
        alt_phone: pick(r, /alt/i) || null,
      })
    }
  }
  return { rows, skippedSheets }
}

export async function fetchContacts() {
  const { data, error } = await supabase
    .from('wa_contacts')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

// Inserts new contacts, skipping ones already stored (same name + same phone).
export async function importContacts(rows, existing) {
  const seen = new Set(existing.map((c) => `${c.name.toLowerCase()}|${digits(c.phone)}`))
  const fresh = []
  for (const r of rows) {
    const k = `${r.name.toLowerCase()}|${digits(r.phone)}`
    if (seen.has(k)) continue
    seen.add(k)
    fresh.push(r)
  }
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await supabase.from('wa_contacts').insert(fresh.slice(i, i + 200))
    if (error) throw error
  }
  return { added: fresh.length, skipped: rows.length - fresh.length }
}

export async function setContacted(id, contacted) {
  const { error } = await supabase.from('wa_contacts').update({ contacted }).eq('id', id)
  if (error) throw error
}

export async function deleteContacts(ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('wa_contacts').delete().in('id', ids.slice(i, i + 100))
    if (error) throw error
  }
}
