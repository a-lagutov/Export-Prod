/** SVG icon representing tree/hierarchy view for the view toggle in the `Resizes` header. */
export function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="3" y1="2" x2="3" y2="12" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="3.5" x2="7" y2="3.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="7" x2="9.5" y2="7" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** SVG icon representing flat table view for the view toggle in the `Resizes` header. */
export function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="5" x2="12.5" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="9" x2="12.5" y2="9" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="5" x2="5" y2="12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
