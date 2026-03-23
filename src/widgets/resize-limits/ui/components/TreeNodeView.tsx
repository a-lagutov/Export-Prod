import { useState } from 'react'
import { TagBadge } from '../../../../shared/ui/TagBadge'
import { countFrames } from '../../../../entities/frame/model/tree'
import { FrameRow } from './FrameRow'
import type { TreeNode } from '../../../../entities/frame/model/types'

interface TreeNodeViewProps {
  node: TreeNode
  formatTag: string
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, value: string) => void
  depth?: number
  defaultExpanded?: boolean
}

/**
 * Recursive collapsible tree node for the `Resizes` tree view.
 * Renders a `FrameRow` for leaf nodes and a collapsible header + children for branch nodes.
 * Format-level nodes get sticky positioning and a `TagBadge`; all nodes expanded by default.
 */
export function TreeNodeView({
  node,
  formatTag,
  frameSizes,
  onFrameSizeChange,
  depth = 0,
  defaultExpanded = true,
}: TreeNodeViewProps) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded)
  const [hovered, setHovered] = useState(false)
  const currentFormat = node.type === 'format' ? node.name.toLowerCase() : formatTag

  if (node.type === 'frame') {
    return (
      <FrameRow
        node={node}
        formatTag={formatTag}
        frameSizes={frameSizes}
        onFrameSizeChange={onFrameSizeChange}
      />
    )
  }

  const hasChildren = node.children && node.children.length > 0

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      <div
        style={{
          cursor: hasChildren ? 'pointer' : 'default',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 4px',
          borderRadius: 4,
          ...(node.type === 'format'
            ? {
                position: 'sticky',
                top: 0,
                zIndex: 1,
                margin: '0 -12px',
                padding: '3px 16px',
                borderRadius: 0,
                background: hovered ? 'var(--figma-color-bg-hover)' : 'var(--figma-color-bg)',
              }
            : { background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent' }),
        }}
        onMouseEnter={() => hasChildren && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => hasChildren && setCollapsed(!collapsed)}
      >
        {hasChildren && (
          <span
            style={{
              display: 'inline-block',
              width: 10,
              fontSize: 8,
              transition: 'transform 0.15s',
              transform: collapsed ? 'rotate(-90deg)' : 'none',
              color: 'var(--figma-color-text-tertiary)',
            }}
          >
            ▼
          </span>
        )}
        <span style={{ fontWeight: node.type === 'format' ? 600 : 400, fontSize: 12 }}>
          {node.name}
        </span>
        {node.type === 'format' && <TagBadge format={currentFormat} />}
        {hasChildren && (
          <span style={{ fontSize: 10, color: 'var(--figma-color-text-tertiary)', marginLeft: 2 }}>
            {countFrames(node)}
          </span>
        )}
      </div>
      {!collapsed && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNodeView
              key={i}
              node={child}
              formatTag={currentFormat}
              frameSizes={frameSizes}
              onFrameSizeChange={onFrameSizeChange}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}
