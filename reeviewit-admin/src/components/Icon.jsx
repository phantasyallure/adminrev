// Small stroke-icon set (24x24, currentColor) so the panel doesn't depend on
// emoji, which render differently on every device.
const PATHS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M17 4a4 4 0 010 7.5M22 21c0-3-1.7-5.4-4-6.5',
  badge: 'M12 15a6 6 0 100-12 6 6 0 000 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
  key: 'M14 10a5 5 0 11-1.5-3.5L21 15v3h-3v-2h-2v-2h-2.5',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21a2 2 0 004 0',
  chevron: 'M9 6l6 6-6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  whatsapp: 'M20 12a8 8 0 01-11.8 7L4 20l1.1-4A8 8 0 1120 12zM9.5 9c.3 2.5 2.5 4.700 5 5l.8-1.200-1.800-.9-.7.6c-.8-.4-1.400-1-1.800-1.800l.6-.7-.9-1.800z',
}

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.8 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.grid} />
    </svg>
  )
}
