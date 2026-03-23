import { useRef } from 'react'
import { Text } from '@create-figma-plugin/ui'
import { NumInput } from '../../../../shared/ui/NumInput'

/**
 * Full-width row for configuring the GIF frame delay in seconds.
 * Clicking anywhere on the row focuses the numeric input.
 */
export function GifDelayRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div
      class="limit-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        margin: '0 -12px',
        cursor: 'default',
      }}
      onClick={() => containerRef.current?.querySelector('input')?.focus()}
    >
      <Text>Задержка GIF</Text>
      <NumInput value={value} onChange={onChange} suffix="сек" containerRef={containerRef} />
    </div>
  )
}
