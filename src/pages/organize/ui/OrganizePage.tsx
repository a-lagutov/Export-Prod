import { useState, useEffect } from 'react'
import { emit, on } from '@create-figma-plugin/utilities'
import { Button, VerticalSpace, SegmentedControl } from '@create-figma-plugin/ui'
import { track } from '../../../shared/analytics/index'
import { declension } from '../../../shared/lib/declension'
import { SelectionIndicator } from '../../../features/place-sections/ui/components/SelectionIndicator'
import { PlaceResultMessage } from '../../../features/place-sections/ui/components/PlaceResultMessage'
import { PathField } from '../../../features/place-sections/ui/components/PathField'
import { PathInput } from '../../../features/place-sections/ui/components/PathInput'
import { SectionTreePanel } from '../../../widgets/section-tree/ui/SectionTreePanel'
import type { SectionFormat } from '../../../entities/frame/model/types'

/**
 * Place tab root component. Lets the user assign selected Figma frames to a section hierarchy.
 * Supports two input modes: "fields" (separate dropdowns) and "path" (slash-separated input).
 * Emits `get-sections` on mount and listens for `sections-data`, `selection-change`, and `place-result`.
 */
export function OrganizePage() {
  const [sections, setSections] = useState<SectionFormat[]>([])
  const [selectedCount, setSelectedCount] = useState(0)
  const [inputMode, setInputMode] = useState<'fields' | 'path'>('fields')

  // Fields mode state
  const [format, setFormat] = useState('')
  const [channel, setChannel] = useState('')
  const [platform, setPlatform] = useState('')
  const [creative, setCreative] = useState('')

  // Path mode state
  const [pathInput, setPathInput] = useState('')

  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    const offs = [
      on('sections-data', ({ sections }: { sections: SectionFormat[] }) => setSections(sections)),
      on('selection-change', ({ count }: { count: number }) => setSelectedCount(count)),
      on('place-result', ({ success, message }: { success: boolean; message: string }) =>
        setResult({ success, message }),
      ),
    ]
    emit('get-sections')
    return () => offs.forEach((off) => off())
  }, [])

  // Derived autocomplete options for fields mode
  const formatSection = sections.find((s) => s.name.toLowerCase() === format.toLowerCase())
  const channelOptions = formatSection ? formatSection.channels.map((c) => c.name) : []
  const channelSection = formatSection?.channels.find((c) => c.name === channel)
  const platformOptions = channelSection ? channelSection.platforms.map((p) => p.name) : []
  const platformSection = channelSection?.platforms.find((p) => p.name === platform)
  const creativeOptions = platformSection ? platformSection.creatives : []

  // Effective values based on mode
  /** Returns the active format/channel/platform/creative values from whichever input mode is selected. */
  function getEffectiveValues() {
    if (inputMode === 'fields') {
      return { fmt: format.trim(), ch: channel.trim(), pl: platform.trim(), cr: creative.trim() }
    }
    const parts = pathInput.split('/').map((s) => s.trim())
    return { fmt: parts[0] || '', ch: parts[1] || '', pl: parts[2] || '', cr: parts[3] || '' }
  }

  const { fmt: eFmt, ch: eCh, pl: ePl, cr: eCr } = getEffectiveValues()
  const canPlace = !!(eFmt && eCh && ePl && eCr && selectedCount > 0)

  /** Clears the previous result, tracks the analytics event, and emits `place-frames` to the code thread. */
  function doPlace(fmt: string, ch: string, pl: string, cr: string) {
    setResult(null)
    track('frames_placed', {
      format: fmt,
      channel: ch,
      platform: pl,
      creative: cr,
      frame_count: selectedCount,
      input_mode: inputMode,
    })
    emit('place-frames', { formatName: fmt, channelName: ch, platformName: pl, creativeName: cr })
  }

  return (
    <div style={{ padding: 12, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}>
      {/* Selection indicator */}
      <SelectionIndicator selectedCount={selectedCount} />

      {/* Input mode toggle */}
      <div class="seg-full">
        <SegmentedControl
          value={inputMode}
          options={[
            { value: 'fields', children: 'По полям' },
            { value: 'path', children: 'Путь' },
          ]}
          onValueChange={setInputMode}
        />
      </div>
      <VerticalSpace space="small" />

      {/* Inputs */}
      {inputMode === 'fields' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <PathField
            label="Формат"
            value={format}
            onChange={(v) => {
              setFormat(v)
              setChannel('')
              setPlatform('')
              setCreative('')
            }}
            options={['JPG', 'PNG', 'WEBP', 'GIF']}
            placeholder="JPG, PNG, WEBP или GIF"
          />
          <PathField
            label="Канал"
            value={channel}
            onChange={(v) => {
              setChannel(v)
              setPlatform('')
              setCreative('')
            }}
            options={channelOptions}
            placeholder="например: 5_Context_Media"
          />
          <PathField
            label="Площадка"
            value={platform}
            onChange={(v) => {
              setPlatform(v)
              setCreative('')
            }}
            options={platformOptions}
            placeholder="например: VK, TG, Bigo"
          />
          <PathField
            label="Креатив"
            value={creative}
            onChange={setCreative}
            options={creativeOptions}
            placeholder="например: 1234-card"
          />
        </div>
      ) : (
        <PathInput value={pathInput} onChange={setPathInput} sections={sections} />
      )}

      {/* Place button */}
      <VerticalSpace space="small" />
      <Button fullWidth onClick={() => doPlace(eFmt, eCh, ePl, eCr)} disabled={!canPlace}>
        {selectedCount > 0
          ? `Поместить ${selectedCount} ${declension(selectedCount, 'фрейм', 'фрейма', 'фреймов')} в секции`
          : 'Поместить в секции'}
      </Button>

      {/* Result */}
      {result && <PlaceResultMessage result={result} />}

      {/* Section tree with add buttons */}
      {sections.length > 0 && (
        <SectionTreePanel sections={sections} onPlace={doPlace} selectedCount={selectedCount} />
      )}
    </div>
  )
}
