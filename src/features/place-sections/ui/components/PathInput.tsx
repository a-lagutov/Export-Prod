import { useState, useMemo, useRef, useEffect } from 'react'
import { SearchTextbox } from '@create-figma-plugin/ui'
import { ComboboxDropdown } from '../../../../shared/ui/ComboboxDropdown'
import {
  LABEL_FORMAT,
  LABEL_CHANNEL,
  LABEL_PLATFORM,
  LABEL_CREATIVE,
  PLACEHOLDER_PATH,
} from '../../../../shared/config/strings'
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
 * @param root0
 * @param root0.value
 * @param root0.onChange
 * @param root0.sections
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
  // Pending "close dropdown" timer from the last blur; cleared on refocus and unmount.
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completions = useMemo(() => getPathCompletions(value, sections), [value, sections])
  const parts = value.split('/')

  useEffect(
    () => () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    },
    [],
  )

  /**
   * Applies a selected autocomplete completion and appends "/" to prompt the next segment.
   * Closes the dropdown only when all 4 path segments are filled.
   * `e.preventDefault()` in `ComboboxDropdown` keeps focus on the input throughout.
   * @param completion
   */
  function handleSelect(completion: string) {
    const completionParts = completion.split('/')
    if (completionParts.length < 4) {
      onChange(completion + '/')
    } else {
      onChange(completion)
      setOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div class="path-input-wrap">
        <SearchTextbox
          value={value}
          placeholder={PLACEHOLDER_PATH}
          onValueInput={onChange}
          onFocus={() => {
            // Refocus within the blur delay must not let the stale timer close the dropdown.
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
            setOpen(true)
          }}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setOpen(false), 150)
          }}
          clearOnEscapeKeyDown
        />
      </div>
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
          {[LABEL_FORMAT, LABEL_CHANNEL, LABEL_PLATFORM, LABEL_CREATIVE].map((label, i) => (
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
