import { SectionFormatNode } from './SectionFormatNode'
import type { SectionFormat } from '../../../../entities/frame/model/types'

/**
 * Scrollable tree of existing page sections filtered by a search query.
 * Renders `SectionFormatNode` for each visible format section.
 */
export function SectionTree({
  sections,
  searchQuery,
  onPlace,
  selectedCount,
}: {
  sections: SectionFormat[]
  searchQuery: string
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const q = searchQuery.toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  return (
    <div
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        border: '1px solid var(--figma-color-border)',
        borderRadius: 6,
        padding: '4px 0',
        fontSize: 11,
      }}
    >
      {sections.map((fmt) => {
        const visibleChannels = fmt.channels.filter(
          (ch) =>
            matches(fmt.name) ||
            matches(ch.name) ||
            ch.platforms.some((pl) => matches(pl.name) || pl.creatives.some(matches)),
        )
        if (visibleChannels.length === 0 && !matches(fmt.name)) return null
        return (
          <SectionFormatNode
            key={fmt.name}
            fmt={fmt}
            visibleChannels={visibleChannels}
            matches={matches}
            onPlace={onPlace}
            selectedCount={selectedCount}
          />
        )
      })}
    </div>
  )
}
