import { useState, useRef } from 'react'
import { TextboxNumeric } from '@create-figma-plugin/ui'
import { TagBadge } from '../../../../shared/ui/TagBadge'
import type { FlatRow } from '../../../../entities/frame/model/tree'

/**
 * A single row in the table view of the `Resizes` screen.
 * Displays format badge, creative name (with full path in `title`), resize name, and a limit input.
 * Clicking anywhere on the row focuses the numeric input.
 */
export function TableRow({
  row,
  frameSizes,
  onFrameSizeChange,
}: {
  row: FlatRow
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, value: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 12px',
        background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => containerRef.current?.querySelector('input')?.focus()}
    >
      <div style={{ flexShrink: 0 }}>
        <TagBadge format={row.formatTag} />
      </div>
      <span
        style={{
          flex: 1,
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          color: 'var(--figma-color-text)',
        }}
        title={`${row.channel} › ${row.platform} › ${row.creative}`}
      >
        {row.creative}
      </span>
      <span
        style={{
          width: 64,
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--figma-color-text-secondary)',
          textAlign: 'right',
        }}
      >
        {row.frameName}
        {row.gifFrameInfo && (
          <span style={{ fontSize: 9, marginLeft: 2, color: 'var(--figma-color-text-tertiary)' }}>
            {row.gifFrameInfo}
          </span>
        )}
      </span>
      <div ref={containerRef} style={{ flexShrink: 0, width: 72 }}>
        <TextboxNumeric
          variant="border"
          value={frameSizes[row.key] ?? ''}
          onValueInput={(v) => onFrameSizeChange(row.key, v)}
          suffix="МБ"
          placeholder="0"
          validateOnBlur={(v) => (v === null || v <= 0 ? null : v)}
        />
      </div>
    </div>
  )
}
