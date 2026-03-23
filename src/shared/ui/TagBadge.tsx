const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  jpg: { bg: '#fff3cd', color: '#856404' },
  png: { bg: '#d4edda', color: '#155724' },
  webp: { bg: '#d1ecf1', color: '#0c5460' },
  gif: { bg: '#f8d7da', color: '#721c24' },
}

/** Colored pill badge showing a format tag (JPG, PNG, WEBP, or GIF) with format-specific colors. */
export function TagBadge({ format }: { format: string }) {
  const c = TAG_COLORS[format] ?? { bg: '#eee', color: '#333' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        textTransform: 'uppercase',
      }}
    >
      {format}
    </span>
  )
}
