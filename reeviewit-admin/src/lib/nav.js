// Single source of truth for the sidebar. A group with `children` is a
// collapsible principal section; related pages live underneath it.
// `badge` names a key from fetchPendingCounts() (the little red numbers).
export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/visitors', label: 'Visitors', icon: 'globe' },
  {
    label: 'Moderation',
    icon: 'shield',
    children: [
      { to: '/reviews', label: 'Reviews', icon: 'star', requires: 'can_approve_reviews', badge: 'reviews' },
      { to: '/products', label: 'Products', icon: 'box', requires: 'can_approve_reviews', badge: 'products' },
    ],
  },
  {
    label: 'Places',
    icon: 'pin',
    children: [
      { to: '/places', label: 'All places', icon: 'pin', requires: 'can_manage_places' },
      { to: '/categories', label: 'Categories', icon: 'grid', requires: 'can_manage_places' },
      { to: '/suggestions', label: 'Place suggestions', icon: 'edit', requires: 'can_manage_places', badge: 'suggestions' },
      { to: '/place-photos', label: 'Place photos', icon: 'image', requires: 'can_manage_places', badge: 'photos' },
      { to: '/photo-review', label: 'Photo review', icon: 'image', requires: 'can_manage_places' },
      { to: '/keywords', label: 'Keywords', icon: 'search', requires: 'can_manage_places' },
      { to: '/keyword-suggestions', label: 'AI keywords', icon: 'sparkle', requires: 'can_manage_places', badge: 'keywords' },
      { to: '/category-images', label: 'Category images', icon: 'image', requires: 'can_manage_places' },
      { to: '/business-claims', label: 'Business claims', icon: 'tag', requires: 'can_manage_places', badge: 'claims' },
      { to: '/duplicates', label: 'Duplicates', icon: 'copy', requires: 'can_manage_places' },
      { to: '/import', label: 'Import', icon: 'upload', requires: 'can_manage_places' },
    ],
  },
  {
    label: 'Community',
    icon: 'users',
    children: [
      { to: '/users', label: 'Users', icon: 'users', requires: 'can_ban_users' },
      { to: '/badges', label: 'Badges', icon: 'badge', requires: 'can_award_badges' },
      { to: '/notifications', label: 'Notifications', icon: 'bell', requires: 'can_send_notifications' },
    ],
  },
  { to: '/roles', label: 'Admin roles', icon: 'key', requires: 'can_manage_roles' },
]
