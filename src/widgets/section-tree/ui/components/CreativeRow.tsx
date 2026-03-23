import { useState } from 'react'

/**
 * Row for a creative section entry in the section tree.
 * Shows the creative name and a "+" button to place selected frames into it.
 * The button is disabled (grayed out) when no frames are selected on the page.
 */
export function CreativeRow({
  name,
  onAdd,
  enabled,
}: {
  name: string
  onAdd: () => void
  enabled: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px 2px 0',
        borderRadius: 3,
        background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent',
      }}
    >
      <span
        style={{ flex: 1, color: 'var(--figma-color-text-tertiary)', fontSize: 10, paddingLeft: 2 }}
      >
        {name}
      </span>
      <button
        class={enabled ? 'btn-icon' : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (enabled) onAdd()
        }}
        title={enabled ? 'Добавить выделенные фреймы' : 'Выделите фреймы на странице'}
        style={{
          width: 18,
          height: 18,
          border: 'none',
          borderRadius: 3,
          background: enabled && hovered ? 'var(--figma-color-bg-brand)' : 'transparent',
          color: enabled ? 'var(--figma-color-text-brand)' : 'var(--figma-color-text-disabled)',
          fontSize: 14,
          lineHeight: '16px',
          cursor: enabled ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
        }}
      >
        +
      </button>
    </div>
  )
}
