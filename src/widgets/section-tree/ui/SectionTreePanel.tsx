import { Fragment, useState } from 'react'
import { VerticalSpace, Text, SearchTextbox } from '@create-figma-plugin/ui'
import { SectionTree } from './components/SectionTree'
import type { SectionFormat } from '../../../entities/frame/model/types'

/**
 * Panel displaying existing sections on the page with a search input and quick-add buttons.
 * Shown at the bottom of the Place tab when sections are available.
 */
export function SectionTreePanel({
  sections,
  onPlace,
  selectedCount,
}: {
  sections: SectionFormat[]
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const [query, setQuery] = useState('')
  return (
    <Fragment>
      <VerticalSpace space="small" />
      <Text>
        <strong>Добавить в секцию</strong>
      </Text>
      <VerticalSpace space="extraSmall" />
      <SearchTextbox clearOnEscapeKeyDown value={query} onValueInput={setQuery} />
      <VerticalSpace space="extraSmall" />
      <SectionTree
        sections={sections}
        searchQuery={query}
        onPlace={onPlace}
        selectedCount={selectedCount}
      />
    </Fragment>
  )
}
