import { emit } from '@create-figma-plugin/utilities'
import { declension } from '../../../../shared/lib/declension'

/**
 * Displays how many frames are currently selected on the Figma page.
 * Shows a branded highlight when frames are selected; a muted state otherwise.
 * Also renders an "Выровнять секции" link that triggers the align-sections operation.
 */
export function SelectionIndicator({ selectedCount }: { selectedCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div
        style={{
          flex: 1,
          padding: '7px 10px',
          background:
            selectedCount > 0 ? 'var(--figma-color-bg-brand)' : 'var(--figma-color-bg-secondary)',
          borderRadius: 6,
          fontSize: 11,
          color:
            selectedCount > 0
              ? 'var(--figma-color-text-onbrand)'
              : 'var(--figma-color-text-secondary)',
        }}
      >
        {selectedCount > 0
          ? `Выделено ${selectedCount} ${declension(selectedCount, 'фрейм', 'фрейма', 'фреймов')} на странице`
          : 'Выделите фреймы на странице'}
      </div>
      <span
        class="link-text"
        onClick={() => emit('align-sections')}
        style={{
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--figma-color-text-brand)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        Выровнять секции
      </span>
    </div>
  )
}
