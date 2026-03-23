import { Fragment } from 'react'
import { VerticalSpace, Text } from '@create-figma-plugin/ui'
import { FormatRow } from './components/FormatRow'
import { PlatformRow } from './components/PlatformRow'

/**
 * Section displaying per-format and per-platform size limits on the main export screen.
 * Renders a `FormatRow` for each format followed by `PlatformRow` entries for its platforms.
 * Each row has an export button to trigger a filtered export for that format/platform.
 */
export function PlatformLimitsSection({
  formatPlatforms,
  platformSizes,
  isExporting,
  onChange,
  onExport,
}: {
  formatPlatforms: { format: string; platforms: string[] }[]
  platformSizes: Record<string, string>
  isExporting: boolean
  onChange: (key: string, v: string) => void
  onExport: (filter: { format?: string; platform?: string }) => void
}) {
  return (
    <Fragment>
      <VerticalSpace space="small" />
      <Text>
        <strong>Лимиты по площадкам</strong>
      </Text>
      <VerticalSpace space="small" />
      <div
        style={{
          border: '1px solid var(--figma-color-border)',
          borderRadius: 6,
          padding: 8,
        }}
      >
        {formatPlatforms.map(({ format, platforms }) => (
          <Fragment key={format}>
            <FormatRow
              format={format}
              value={platformSizes[format] ?? ''}
              onChange={(v) => onChange(format, v)}
              isExporting={isExporting}
              onExport={() => onExport({ format })}
            />
            {platforms.map((name) => (
              <PlatformRow
                key={name}
                name={name}
                format={format}
                value={platformSizes[`${format}/${name}`] ?? ''}
                onChange={(v) => onChange(`${format}/${name}`, v)}
                isExporting={isExporting}
                onExport={() => onExport({ format, platform: name })}
              />
            ))}
            <VerticalSpace space="extraSmall" />
          </Fragment>
        ))}
      </div>
    </Fragment>
  )
}
