import { useState, useMemo } from 'react'
import { Textbox } from '@create-figma-plugin/ui'
import { ComboboxDropdown } from '../../../../shared/ui/ComboboxDropdown'
import type { SectionFormat } from '../../../../entities/frame/model/types'

/**
 * Computes autocomplete suggestions for a slash-separated path input based on the current depth.
 * Depth 0 → format names; depth 1 → channels; depth 2 → platforms; depth 3 → creatives.
 * Returns full path completions (e.g. `"JPG/Channel/Platform"`) to replace the entire input value.
 * @param input - Current path string, e.g. `"JPG/Channel/"`.
 * @param sections - Available sections hierarchy from the code thread.
 */
function getPathCompletions(input: string, sections: SectionFormat[]): string[] {
  const parts = input.split('/')
  const depth = parts.length - 1
  const current = parts[depth].toLowerCase()
  const prev = parts.slice(0, depth)

  if (depth === 0) {
    return sections.filter((f) => f.name.toLowerCase().includes(current)).map((f) => f.name)
  }
  const fmt = sections.find((f) => f.name.toLowerCase() === prev[0]?.toLowerCase())
  if (!fmt) return []
  if (depth === 1) {
    return fmt.channels
      .filter((c) => c.name.toLowerCase().includes(current))
      .map((c) => `${prev[0]}/${c.name}`)
  }
  const ch = fmt.channels.find((c) => c.name === prev[1])
  if (!ch) return []
  if (depth === 2) {
    return ch.platforms
      .filter((p) => p.name.toLowerCase().includes(current))
      .map((p) => `${prev.join('/')}/${p.name}`)
  }
  const pl = ch.platforms.find((p) => p.name === prev[2])
  if (!pl) return []
  return pl.creatives
    .filter((cr) => cr.toLowerCase().includes(current))
    .map((cr) => `${prev.join('/')}/${cr}`)
}

/**
 * Single-field path input for the "Путь" mode in the Place tab.
 * Accepts a slash-separated path (`Format/Channel/Platform/Creative`) with segment-aware autocomplete.
 * Shows a breadcrumb hint row highlighting the currently active segment.
 */
export function PathInput({
  value,
  onChange,
  sections,
}: {
  value: string
  onChange: (v: string) => void
  sections: SectionFormat[]
}) {
  const [open, setOpen] = useState(false)
  const completions = useMemo(() => getPathCompletions(value, sections), [value, sections])
  const parts = value.split('/')

  /** Applies a selected autocomplete completion and appends "/" if the path is not yet fully specified. */
  function handleSelect(completion: string) {
    // If less than 4 parts, append "/" to prompt next segment
    const completionParts = completion.split('/')
    onChange(completionParts.length < 4 ? completion + '/' : completion)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <Textbox
        variant="border"
        value={value}
        placeholder="GIF/Канал/Площадка/Креатив"
        onValueInput={onChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {/* Segment hint */}
      {parts.length < 5 && (
        <div
          style={{
            marginTop: 3,
            fontSize: 10,
            color: 'var(--figma-color-text-tertiary)',
            display: 'flex',
            gap: 4,
          }}
        >
          {['Формат', 'Канал', 'Площадка', 'Креатив'].map((label, i) => (
            <span
              key={label}
              style={{
                fontWeight: i === parts.length - 1 ? 600 : 400,
                color:
                  i === parts.length - 1
                    ? 'var(--figma-color-text-brand)'
                    : 'var(--figma-color-text-tertiary)',
              }}
            >
              {i > 0 && '/ '}
              {label}
            </span>
          ))}
        </div>
      )}
      {open && completions.length > 0 && (
        <ComboboxDropdown options={completions} onSelect={handleSelect} />
      )}
    </div>
  )
}
