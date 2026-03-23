import { declension } from '../../../../shared/lib/declension'

/**
 * Navigation button on the main export screen that opens the `Resizes` sub-screen.
 * Accepts hover/pressed state as props (instead of CSS classes) because inline `background`
 * would override CSS `:hover` rules.
 */
export function ResizeLimitsButton({
  count,
  hovered,
  pressed,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
}: {
  count: number
  hovered: boolean
  pressed: boolean
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onMouseDown: () => void
  onMouseUp: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        border: '1px solid var(--figma-color-border)',
        borderRadius: 6,
        background: pressed
          ? 'var(--figma-color-bg-selected)'
          : hovered
            ? 'var(--figma-color-bg-tertiary)'
            : 'var(--figma-color-bg-secondary)',
        color: 'var(--figma-color-text)',
        fontSize: 12,
        cursor: 'pointer',
        marginBottom: 0,
      }}
    >
      <span style={{ fontWeight: 600 }}>Ресайзы</span>
      <span style={{ color: 'var(--figma-color-text-tertiary)', fontSize: 11 }}>
        {count} {declension(count, 'файл', 'файла', 'файлов')} ›
      </span>
    </button>
  )
}
