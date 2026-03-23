import { useState, useRef } from 'react'
import { TextboxNumeric } from '@create-figma-plugin/ui'
import type { TreeNode } from '../../../../entities/frame/model/types'

/**
 * A single frame row in the tree view of the `Resizes` screen.
 * Shows the frame name (without extension) and a numeric size-limit input.
 * Clicking anywhere on the row focuses the input; hover highlight uses state (not CSS class)
 * because inline `background` would override CSS `:hover`.
 */
export function FrameRow({
  node,
  formatTag,
  frameSizes,
  onFrameSizeChange,
}: {
  node: TreeNode
  formatTag: string
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, value: string) => void
}) {
  const key = `${node.name}_${formatTag}`
  const nameNoExt = node.name.replace(/\.[^.]+$/, '')
  const gifInfo = formatTag === 'gif' ? node.size?.match(/\(\d+ frames?\)/) : null
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0 3px 8px',
        borderRadius: 4,
        cursor: 'default',
        background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => containerRef.current?.querySelector('input')?.focus()}
    >
      <span style={{ flex: 1, fontSize: 11, color: 'var(--figma-color-text)' }}>
        {nameNoExt}
        {gifInfo && (
          <span style={{ fontSize: 10, color: 'var(--figma-color-text-tertiary)', marginLeft: 4 }}>
            {gifInfo[0]}
          </span>
        )}
      </span>
      <div ref={containerRef} style={{ flexShrink: 0, width: 64 }}>
        <TextboxNumeric
          variant="border"
          value={frameSizes[key] ?? ''}
          onValueInput={(v) => onFrameSizeChange(key, v)}
          suffix="МБ"
          placeholder="0"
          validateOnBlur={(v) => (v === null || v <= 0 ? null : v)}
        />
      </div>
    </div>
  )
}
