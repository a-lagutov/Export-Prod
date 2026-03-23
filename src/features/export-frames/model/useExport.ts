import { useState, useEffect, useRef, useMemo } from 'react'
import { emit, on } from '@create-figma-plugin/utilities'
import JSZip from 'jszip'
import { convertFrame } from '../../../shared/lib/compression'
import { assembleGif } from '../../../shared/lib/gif'
import { buildPreviewHtml } from '../../../shared/lib/preview'
import { filterTree, flattenToRows, filterFlatRows } from '../../../entities/frame/model/tree'
import { track } from '../../../shared/analytics/index'
import { log, error, fromCodeThread } from '../../../shared/logger/index'
import type { TreeNode, ExportItem } from '../../../entities/frame/model/types'

export type Phase = 'loading' | 'empty' | 'ready' | 'exporting' | 'done'

/**
 * Core hook for the Export tab. Manages all export state, message listeners, and handlers.
 *
 * State phases: `loading` → `empty` | `ready` → `exporting` → `done`.
 * Registers listeners for `scan-result`, `frame-data`, `gif-data`, `export-complete`, and `code-log`.
 * Emits `scan` on mount (pull pattern — avoids race condition with push-on-startup).
 *
 * @returns All export state, derived values, and handler functions needed by ExportPage.
 */
export function useExport() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [items, setItems] = useState<ExportItem[]>([])
  const [platformSizes, setPlatformSizes] = useState<Record<string, string>>({})
  const [frameSizes, setFrameSizes] = useState<Record<string, string>>({})
  const [gifDelay, setGifDelay] = useState('3')
  const [progress, setProgress] = useState({ current: 0, total: 0, text: '' })
  const [zipBlob, setZipBlob] = useState<Blob | null>(null)
  const [zipSizeMb, setZipSizeMb] = useState(0)
  const [exportedCount, setExportedCount] = useState(0)
  const [exportedFilter, setExportedFilter] = useState<{
    format?: string
    platform?: string
  } | null>(null)
  const [search, setSearch] = useState('')
  const [resizeLimitsView, setResizeLimitsView] = useState<'tree' | 'table'>('tree')
  const [resizeBtnHovered, setResizeBtnHovered] = useState(false)
  const [resizeBtnPressed, setResizeBtnPressed] = useState(false)

  // Refs for access inside async message handlers without stale closure issues
  const itemsRef = useRef<ExportItem[]>([])
  const platformSizesRef = useRef<Record<string, string>>({})
  const frameSizesRef = useRef<Record<string, string>>({})
  const gifDelayRef = useRef('3')
  const cancelledRef = useRef(false)
  const activeCountRef = useRef(0)
  const exportFilterRef = useRef<{ format?: string; platform?: string } | null>(null)
  const exportedFilesRef = useRef<string[]>([])
  const zipRef = useRef<JSZip | null>(null)
  const exportStartTimeRef = useRef<number>(0)
  const openTrackedRef = useRef(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => {
    platformSizesRef.current = platformSizes
  }, [platformSizes])
  useEffect(() => {
    frameSizesRef.current = frameSizes
  }, [frameSizes])
  useEffect(() => {
    gifDelayRef.current = gifDelay
  }, [gifDelay])

  /** Strips the leading format folder segment from a full path to produce the ZIP-relative path. */
  function resolvePath(path: string): string {
    return path.split('/').slice(1).join('/')
  }

  /**
   * Resolves the active size limit in bytes for a given frame, applying priority:
   * per-frame limit > per-platform limit > per-format limit.
   * Returns null if no limit is configured or the configured value is zero.
   */
  function getLimit(fileName: string, format: string, platformName: string): number | null {
    const fSizes = frameSizesRef.current
    const pSizes = platformSizesRef.current
    const frameKey = fileName + '_' + format
    if (fSizes[frameKey] && parseFloat(fSizes[frameKey]) > 0) {
      return parseFloat(fSizes[frameKey]) * 1024 * 1024
    }
    const platKey = `${format}/${platformName}`
    if (pSizes[platKey] && parseFloat(pSizes[platKey]) > 0) {
      return parseFloat(pSizes[platKey]) * 1024 * 1024
    }
    if (pSizes[format] && parseFloat(pSizes[format]) > 0) {
      return parseFloat(pSizes[format]) * 1024 * 1024
    }
    return null
  }

  useEffect(() => {
    const offs = [
      on(
        'scan-result',
        ({ tree: newTree, items: newItems }: { tree: TreeNode[]; items: ExportItem[] }) => {
          setTree(newTree)
          setItems(newItems)
          itemsRef.current = newItems
          if (!openTrackedRef.current) {
            openTrackedRef.current = true
            track('plugin_opened', {
              frame_count: newItems.length,
              has_frames: newItems.length > 0,
            })
          }
          log('scan-result', { frame_count: newItems.length })
          setPhase((prev) => (prev === 'exporting' ? prev : newTree.length > 0 ? 'ready' : 'empty'))
        },
      ),

      on('rename-done', () => {
        log('rename-done → emitting start-export', { activeCount: activeCountRef.current })
        cancelledRef.current = false
        setProgress({ current: 0, total: activeCountRef.current, text: 'Начинаем экспорт...' })
        emit('start-export')
      }),

      on(
        'frame-data',
        async ({
          index,
          total,
          path,
          format,
          pngBytes,
          platformName,
        }: {
          index: number
          total: number
          path: string
          format: string
          pngBytes: ArrayBuffer
          platformName: string
        }) => {
          const limit = getLimit(path.split('/').pop()!, format, platformName)
          setProgress({
            current: index + 1,
            total,
            text: `Обработка ${index + 1}/${total}: ${path}`,
          })
          log('frame-data', { index, total, path, format, limitBytes: limit })
          try {
            const blob = await convertFrame(new Uint8Array(pngBytes), format, limit)
            const zPath = resolvePath(path)
            zipRef.current?.file(zPath, blob)
            exportedFilesRef.current.push(zPath)
          } catch (e) {
            error('convertFrame failed', { path, format, error: String(e) })
            track('export_error', { format, error: String(e) })
          }
          if (!cancelledRef.current) {
            emit('request-frame', { index: index + 1 })
          }
        },
      ),

      on(
        'gif-data',
        async ({
          index,
          total,
          path,
          frames,
          width,
          height,
          platformName,
        }: {
          index: number
          total: number
          path: string
          frames: ArrayBuffer[]
          width: number
          height: number
          platformName: string
        }) => {
          const limit = getLimit(path.split('/').pop()!, 'gif', platformName)
          const delay = parseFloat(gifDelayRef.current) * 1000 || 3000
          setProgress({
            current: index + 1,
            total,
            text: `Сборка GIF ${index + 1}/${total}: ${path}`,
          })
          log('gif-data', { index, total, path, limitBytes: limit })
          try {
            const blob = await assembleGif(frames, width, height, delay, limit)
            const zPath = resolvePath(path)
            zipRef.current?.file(zPath, blob)
            exportedFilesRef.current.push(zPath)
          } catch (e) {
            error('assembleGif failed', { path, error: String(e) })
            track('export_error', { format: 'gif', error: String(e) })
          }
          if (!cancelledRef.current) {
            emit('request-frame', { index: index + 1 })
          }
        },
      ),

      on('export-complete', () => {
        setProgress((p) => ({ ...p, text: 'Создание ZIP...' }))
        const previewHtml = buildPreviewHtml(exportedFilesRef.current)
        zipRef.current?.file('preview.html', previewHtml)
        zipRef.current?.generateAsync({ type: 'blob' }).then((blob) => {
          setZipBlob(blob)
          setZipSizeMb(parseFloat((blob.size / 1024 / 1024).toFixed(2)))
          setExportedCount(exportedFilesRef.current.length)
          setExportedFilter(exportFilterRef.current)
          setPhase('done')
          track('export_completed', {
            frame_count: activeCountRef.current,
            duration_ms: Date.now() - exportStartTimeRef.current,
            zip_size_mb: parseFloat((blob.size / 1024 / 1024).toFixed(2)),
          })
        })
      }),

      on(
        'code-log',
        ({
          level,
          message,
          data,
        }: {
          level: 'log' | 'warn' | 'error' | 'info'
          message: string
          data?: unknown
        }) => {
          fromCodeThread(level, message, data)
        },
      ),
    ]

    // Request initial scan now that the listeners are registered
    emit('scan')
    return () => offs.forEach((off) => off())
  }, [])

  /** Clears the search input and triggers a fresh page scan. */
  function handleRescan() {
    setSearch('')
    emit('scan')
  }

  /**
   * Starts the export pipeline: renames frames, then triggers sequential frame processing.
   * @param filter - Optional format/platform filter to export a subset of frames.
   */
  function handleExport(filter?: { format?: string; platform?: string }) {
    log('handleExport called', { filter })
    const activeCount = filter
      ? items.filter(
          (i) =>
            (!filter.format || i.format === filter.format) &&
            (!filter.platform || i.platformName === filter.platform),
        ).length
      : items.length
    activeCountRef.current = activeCount
    exportFilterRef.current = filter ?? null
    zipRef.current = new JSZip()
    exportedFilesRef.current = []
    exportStartTimeRef.current = Date.now()
    setZipBlob(null)
    setPhase('exporting')
    setProgress({ current: 0, total: activeCount, text: 'Переименование фреймов...' })
    track('export_started', { frame_count: activeCount })
    emit('rename-frames', { filterFormat: filter?.format, filterPlatform: filter?.platform })
  }

  /** Cancels the in-progress export: sets the cancelled flag and returns the UI to the ready phase. */
  function handleCancel() {
    track('export_cancelled', {
      frame_count: activeCountRef.current,
      completed: progress.current,
      duration_ms: Date.now() - exportStartTimeRef.current,
    })
    cancelledRef.current = true
    setPhase('ready')
    setProgress({ current: 0, total: 0, text: '' })
  }

  /** Triggers a browser download of the assembled ZIP file with a name derived from the active filter. */
  function handleDownload() {
    if (!zipBlob) return
    const filter = exportFilterRef.current
    let name = 'export-prod'
    if (filter?.format) name += `-${filter.format}`
    if (filter?.platform)
      name += `-${filter.platform.toLowerCase().replace(/[\s/\\:*?"<>|]+/g, '-')}`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipBlob)
    a.download = `${name}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search])
  const flatRows = useMemo(() => flattenToRows(tree), [tree])
  const filteredFlatRows = useMemo(() => filterFlatRows(flatRows, search), [flatRows, search])

  const formatPlatforms = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const item of items) {
      if (!map[item.format]) map[item.format] = new Set()
      map[item.format].add(item.platformName)
    }
    return (['jpg', 'png', 'webp', 'gif'] as const)
      .filter((f) => map[f])
      .map((f) => ({ format: f, platforms: Array.from(map[f]) }))
  }, [items])

  const hasGif = items.some((i) => i.format === 'gif')
  const progressPct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0
  const isExporting = phase === 'exporting'

  return {
    // State
    phase,
    tree,
    items,
    platformSizes,
    setPlatformSizes,
    frameSizes,
    setFrameSizes,
    gifDelay,
    setGifDelay,
    progress,
    zipBlob,
    zipSizeMb,
    exportedCount,
    exportedFilter,
    search,
    setSearch,
    resizeLimitsView,
    setResizeLimitsView,
    resizeBtnHovered,
    setResizeBtnHovered,
    resizeBtnPressed,
    setResizeBtnPressed,
    // Derived
    filteredTree,
    flatRows,
    filteredFlatRows,
    formatPlatforms,
    hasGif,
    progressPct,
    isExporting,
    // Handlers
    handleRescan,
    handleExport,
    handleCancel,
    handleDownload,
  }
}
