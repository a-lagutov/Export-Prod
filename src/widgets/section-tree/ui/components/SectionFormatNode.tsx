import { useState } from 'react'
import { TagBadge } from '../../../../shared/ui/TagBadge'
import { SectionChannelNode } from './SectionChannelNode'
import type { SectionFormat } from '../../../../entities/frame/model/types'

/**
 * Collapsible format-level node in the section tree (e.g. JPG, PNG).
 * Renders a `TagBadge` and expands to show `SectionChannelNode` children.
 */
export function SectionFormatNode({
  fmt,
  visibleChannels,
  matches,
  onPlace,
  selectedCount,
}: {
  fmt: SectionFormat
  visibleChannels: SectionFormat['channels']
  matches: (s: string) => boolean
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <div
        class="tree-header"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          userSelect: 'none',
          fontWeight: 600,
        }}
      >
        <span
          style={{
            fontSize: 8,
            color: 'var(--figma-color-text-tertiary)',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            display: 'inline-block',
            width: 10,
            transition: 'transform 0.12s',
          }}
        >
          ▼
        </span>
        <TagBadge format={fmt.name.toLowerCase()} />
        <span style={{ marginLeft: 2 }}>{fmt.name}</span>
      </div>
      {!collapsed &&
        visibleChannels.map((ch) => (
          <SectionChannelNode
            key={ch.name}
            ch={ch}
            formatName={fmt.name}
            matches={matches}
            onPlace={onPlace}
            selectedCount={selectedCount}
          />
        ))}
    </div>
  )
}
