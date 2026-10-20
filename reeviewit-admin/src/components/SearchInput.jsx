export default function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="topbar-search" style={{ maxWidth: 320 }}>
      <span aria-hidden="true" style={{ color: 'var(--ink-faint)' }}>⌕</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
