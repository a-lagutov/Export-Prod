import { Muted } from '@create-figma-plugin/ui'
import { ResizeLimitsHeader } from './components/ResizeLimitsHeader'
import { TreeNodeView } from './components/TreeNodeView'
import { TableHeader } from './components/TableHeader'
import { TableRow } from './components/TableRow'
import { filterTree, filterFlatRows } from '../../../entities/frame/model/tree'
import { useMemo } from 'react'
import type { TreeNode } from '../../../entities/frame/model/types'
import type { FlatRow } from '../../../entities/frame/model/tree'

/**
 * Sub-screen for viewing and editing per-frame size limits.
 * Supports two views toggled in the header: tree (collapsible hierarchy) and table (flat list).
 * Search is applied to both views via the fixed header input.
 */
export function ResizeLimitsScreen({
  tree,
  frameSizes,
  onFrameSizeChange,
  search,
  onSearch,
  resizeLimitsView,
  setResizeLimitsView,
  onBack,
}: {
  tree: TreeNode[]
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, val: string) => void
  search: string
  onSearch: (v: string) => void
  resizeLimitsView: 'tree' | 'table'
  setResizeLimitsView: (v: 'tree' | 'table') => void
  onBack: () => void
}) {
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search])
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = []
    for (const fmt of tree) {
      const formatTag = fmt.name.toLowerCase()
      for (const ch of fmt.children ?? []) {
        for (const pl of ch.children ?? []) {
          for (const cr of pl.children ?? []) {
            for (const fr of cr.children ?? []) {
              if (fr.type === 'frame') {
                const gifInfo =
                  formatTag === 'gif' ? fr.size?.match(/\(\d+ frames?\)/)?.[0] : undefined
                rows.push({
                  key: `${fr.name}_${formatTag}`,
                  formatTag,
                  channel: ch.name,
                  platform: pl.name,
                  creative: cr.name,
                  frameName: fr.name.replace(/\.[^.]+$/, ''),
                  gifFrameInfo: gifInfo,
                })
              }
            }
          }
        }
      }
    }
    return rows
  }, [tree])
  const filteredFlatRows = useMemo(() => filterFlatRows(flatRows, search), [flatRows, search])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      {/* Back header */}
      <ResizeLimitsHeader
        view={resizeLimitsView}
        onViewChange={setResizeLimitsView}
        search={search}
        onSearch={onSearch}
        onBack={onBack}
      />

      {/* Tree / Table */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: resizeLimitsView === 'tree' ? '0 12px 12px' : '0 0 12px',
        }}
      >
        {resizeLimitsView === 'tree' ? (
          filteredTree.length > 0 ? (
            filteredTree.map((node, i) => (
              <TreeNodeView
                key={i}
                node={node}
                formatTag=""
                frameSizes={frameSizes}
                onFrameSizeChange={onFrameSizeChange}
                defaultExpanded={true}
              />
            ))
          ) : (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <Muted>Ничего не найдено</Muted>
            </div>
          )
        ) : filteredFlatRows.length > 0 ? (
          <>
            <TableHeader />
            {filteredFlatRows.map((row, i) => (
              <TableRow
                key={i}
                row={row}
                frameSizes={frameSizes}
                onFrameSizeChange={onFrameSizeChange}
              />
            ))}
          </>
        ) : (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <Muted>Ничего не найдено</Muted>
          </div>
        )}
      </div>
    </div>
  )
}
