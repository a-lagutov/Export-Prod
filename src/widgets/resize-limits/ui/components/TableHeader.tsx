/** Sticky column header row for the table view: Format / Creative / Resize / Limit. */
export function TableHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 12px',
        position: 'sticky',
        top: 0,
        background: 'var(--figma-color-bg)',
        zIndex: 1,
        borderBottom: '1px solid var(--figma-color-border)',
      }}
    >
      <span style={{ width: 36, fontSize: 10, color: 'var(--figma-color-text-tertiary)' }}>
        Формат
      </span>
      <span
        style={{ flex: 1, fontSize: 10, color: 'var(--figma-color-text-tertiary)', minWidth: 0 }}
      >
        Креатив
      </span>
      <span
        style={{
          width: 64,
          fontSize: 10,
          color: 'var(--figma-color-text-tertiary)',
          textAlign: 'right',
        }}
      >
        Ресайз
      </span>
      <span
        style={{
          width: 48,
          fontSize: 10,
          color: 'var(--figma-color-text-tertiary)',
          textAlign: 'right',
        }}
      >
        Лимит
      </span>
      <span style={{ width: 20 }} />
    </div>
  )
}
