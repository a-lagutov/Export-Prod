/**
 * Floating dropdown list of autocomplete options positioned below the trigger element.
 * Uses `onMouseDown` instead of `onClick` to fire before the input's `onBlur` event.
 */
export function ComboboxDropdown({
  options,
  onSelect,
}: {
  options: string[]
  onSelect: (v: string) => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'var(--figma-color-bg)',
        border: '1px solid var(--figma-color-border)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxHeight: 160,
        overflowY: 'auto',
        marginTop: 2,
      }}
    >
      {options.map((o) => (
        <div
          key={o}
          onMouseDown={() => onSelect(o)}
          style={{
            padding: '6px 8px',
            fontSize: 11,
            cursor: 'pointer',
            color: 'var(--figma-color-text)',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLDivElement).style.background = 'var(--figma-color-bg-hover)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLDivElement).style.background = 'transparent')
          }
        >
          {o}
        </div>
      ))}
    </div>
  )
}
