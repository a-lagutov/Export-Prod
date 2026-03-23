import { emit, on } from '@create-figma-plugin/utilities'
import {
  scanPage,
  getSectionsHierarchy,
  updateExportItems,
  exportItems,
} from '../../../entities/frame/api'
import type { ExportItem } from '../../../entities/frame/model/types'
import * as config from '../../../shared/config'

export let isExporting = false

/** Forwards a log message from the code thread to the UI thread via the `code-log` message. */
function codeLog(message: string, data?: unknown): void {
  emit('code-log', { level: 'log', message, data })
}

/**
 * Checks whether a Figma node belongs to the currently active page by walking up the parent chain.
 * Detached nodes (e.g. just deleted) are conservatively treated as being on the current page.
 */
function isOnCurrentPage(node: BaseNode): boolean {
  let n: BaseNode | null = node
  while (n) {
    if (n.type === 'PAGE') return n.id === figma.currentPage.id
    n = n.parent
  }
  // Detached node (e.g. just deleted) — conservatively treat as current page
  return true
}

/**
 * Exports the frame at the given index from the current export queue and emits the result to the UI thread.
 * For GIF items, exports all slide frames and emits `gif-data`; for others, emits `frame-data`.
 * @param index - Zero-based index into the `exportItems` array.
 */
async function sendFrame(index: number): Promise<void> {
  const item = exportItems[index]
  const total = exportItems.length
  const exportSettings: ExportSettings = {
    format: 'PNG',
    constraint: { type: 'SCALE', value: config.EXPORT_SCALE },
  }

  if (item.format === 'gif') {
    const framesData: Uint8Array[] = []
    for (const nodeId of item.nodeIds) {
      const node = (await figma.getNodeByIdAsync(nodeId)) as FrameNode
      const bytes = await node.exportAsync(exportSettings)
      framesData.push(bytes)
    }
    emit('gif-data', {
      index,
      total,
      path: item.path,
      frames: framesData,
      platformName: item.platformName,
      width: item.width,
      height: item.height,
    })
  } else {
    const node = (await figma.getNodeByIdAsync(item.nodeIds[0])) as FrameNode
    const pngBytes = await node.exportAsync(exportSettings)
    emit('frame-data', {
      index,
      total,
      path: item.path,
      format: item.format,
      pngBytes,
      platformName: item.platformName,
      width: item.width,
      height: item.height,
    })
  }
}

/**
 * Registers all code-thread message handlers for the export feature:
 * `scan`, `rename-frames`, `start-export`, `request-frame`.
 * Also sets up a debounced `documentchange` listener for auto-rescanning on page edits.
 */
export function register(): void {
  on('scan', () => {
    const result = scanPage()
    updateExportItems(result.items)
    emit('scan-result', { tree: result.tree, items: result.items })
  })

  on(
    'rename-frames',
    async ({
      filterFormat,
      filterPlatform,
    }: {
      filterFormat?: string
      filterPlatform?: string
    }) => {
      codeLog('rename-frames received', {
        filterFormat,
        filterPlatform,
        exportItemsCount: exportItems.length,
      })
      isExporting = true
      const fmtLower = filterFormat?.toLowerCase()
      for (const item of exportItems) {
        for (const nodeId of item.nodeIds) {
          const node = await figma.getNodeByIdAsync(nodeId)
          if (node && node.type === 'FRAME') {
            const frameName = `${(node as FrameNode).width}x${(node as FrameNode).height}`
            node.name = frameName
          }
        }
      }
      const result = scanPage()
      let filtered: ExportItem[] = result.items
      if (fmtLower || filterPlatform) {
        filtered = result.items.filter(
          (item) =>
            (!fmtLower || item.format === fmtLower) &&
            (!filterPlatform || item.platformName === filterPlatform),
        )
      }
      updateExportItems(filtered)
      emit('scan-result', { tree: result.tree, items: result.items })
      codeLog('rename-done emitted', { exportItemsCount: exportItems.length })
      emit('rename-done')
    },
  )

  on('start-export', async () => {
    codeLog('start-export received', { exportItemsCount: exportItems.length })
    if (exportItems.length > 0) {
      await sendFrame(0)
    } else {
      codeLog('start-export: no items, emitting export-complete')
      emit('export-complete')
    }
  })

  on('request-frame', async ({ index }: { index: number }) => {
    if (index < exportItems.length) {
      await sendFrame(index)
    } else {
      isExporting = false
      emit('export-complete')
    }
  })

  // Debounced auto-rescan on document changes (section added/removed/renamed)
  ;(async () => {
    await figma.loadAllPagesAsync()
    let rescanTimer: ReturnType<typeof setTimeout> | null = null
    figma.on('documentchange', (event) => {
      if (isExporting) return
      const relevant = event.documentChanges.some((change) => {
        const node = (change as unknown as { node?: BaseNode }).node
        return node ? isOnCurrentPage(node) : false
      })
      if (!relevant) return
      if (rescanTimer) clearTimeout(rescanTimer)
      rescanTimer = setTimeout(() => {
        rescanTimer = null
        const result = scanPage()
        updateExportItems(result.items)
        emit('scan-result', { tree: result.tree, items: result.items })
        emit('sections-data', { sections: getSectionsHierarchy() })
      }, config.RESCAN_DEBOUNCE_MS)
    })
  })()
}
