import { useState } from 'react'
import { SectionPlatformNode } from './SectionPlatformNode'

/**
 * Collapsible channel-level node in the section tree. Collapsed by default.
 * Expands to show `SectionPlatformNode` children for each platform.
 */
export function SectionChannelNode({
  ch,
  formatName,
  matches,
  onPlace,
  selectedCount,
}: {
  ch: { name: string; platforms: { name: string; creatives: string[] }[] }
  formatName: string
  matches: (s: string) => boolean
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div style={{ paddingLeft: 14 }}>
      <div
        class="tree-header"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px 3px 0',
          cursor: 'pointer',
          userSelect: 'none',
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
        <span style={{ color: 'var(--figma-color-text)' }}>{ch.name}</span>
      </div>
      {!collapsed &&
        ch.platforms.map((pl) => (
          <SectionPlatformNode
            key={pl.name}
            pl={pl}
            formatName={formatName}
            chName={ch.name}
            matches={matches}
            onPlace={onPlace}
            selectedCount={selectedCount}
          />
        ))}
    </div>
  )
}
