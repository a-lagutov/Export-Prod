import { Fragment, useState } from 'react'
import { Button, VerticalSpace, Muted } from '@create-figma-plugin/ui'
import { useExport } from '../../../features/export-frames/model/useExport'
import { ResizeLimitsScreen } from '../../../widgets/resize-limits/ui/ResizeLimitsScreen'
import { SetupGuide } from '../../../features/export-frames/ui/SetupGuide'
import { ResizeLimitsButton } from '../../../widgets/resize-limits/ui/components/ResizeLimitsButton'
import { PlatformLimitsSection } from '../../../widgets/platform-limits/ui/PlatformLimitsSection'
import { GifDelayRow } from '../../../widgets/platform-limits/ui/components/GifDelayRow'
import { ProgressBar } from '../../../shared/ui/ProgressBar'
import { declension } from '../../../shared/lib/declension'

/**
 * Export tab root component. Manages the `screen` state (`"main"` | `"resize-limits"`)
 * and delegates all export logic to `useExport`. Renders either the main export UI
 * or the `ResizeLimitsScreen` sub-screen based on current screen state.
 */
export function ExportPage() {
  const [screen, setScreen] = useState<'main' | 'resize-limits'>('main')

  const {
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
    formatPlatforms,
    hasGif,
    progressPct,
    isExporting,
    handleRescan,
    handleExport,
    handleCancel,
    handleDownload,
  } = useExport()

  // ── Loading state ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <VerticalSpace space="large" />
        <Muted>Сканирование страницы...</Muted>
      </div>
    )
  }

  // ── Empty state — show guide ──────────────────────────────────────────────
  if (phase === 'empty') {
    return (
      <div style={{ padding: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <SetupGuide />
        <VerticalSpace space="small" />
        <Button fullWidth onClick={handleRescan}>
          Пересканировать
        </Button>
      </div>
    )
  }

  // ── Resize limits screen ───────────────────────────────────────────────────
  if (screen === 'resize-limits') {
    return (
      <ResizeLimitsScreen
        tree={tree}
        frameSizes={frameSizes}
        onFrameSizeChange={(key, val) => setFrameSizes((prev) => ({ ...prev, [key]: val }))}
        search={search}
        onSearch={setSearch}
        resizeLimitsView={resizeLimitsView}
        setResizeLimitsView={setResizeLimitsView}
        onBack={() => setScreen('main')}
      />
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
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
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 12 }}>
        {/* Resize limits button */}
        <ResizeLimitsButton
          count={items.length}
          hovered={resizeBtnHovered}
          pressed={resizeBtnPressed}
          onClick={() => setScreen('resize-limits')}
          onMouseEnter={() => setResizeBtnHovered(true)}
          onMouseLeave={() => {
            setResizeBtnHovered(false)
            setResizeBtnPressed(false)
          }}
          onMouseDown={() => setResizeBtnPressed(true)}
          onMouseUp={() => setResizeBtnPressed(false)}
        />

        {/* Platform limits */}
        {formatPlatforms.length > 0 && (
          <PlatformLimitsSection
            formatPlatforms={formatPlatforms}
            platformSizes={platformSizes}
            isExporting={isExporting}
            onChange={(key, v) => setPlatformSizes((prev) => ({ ...prev, [key]: v }))}
            onExport={handleExport}
          />
        )}

        {/* GIF delay */}
        {hasGif && (
          <Fragment>
            <VerticalSpace space="small" />
            <GifDelayRow value={gifDelay} onChange={setGifDelay} />
          </Fragment>
        )}
      </div>

      {/* Export button */}
      {!isExporting && phase !== 'done' && (
        <div
          style={{
            padding: '12px 16px 16px',
            background: 'var(--figma-color-bg)',
            borderTop: '1px solid var(--figma-color-border)',
          }}
        >
          <div class="export-btn-wrap">
            <style>{`.export-btn-wrap button { padding: 12px 16px !important; font-size: 13px !important; height: auto !important; }`}</style>
            <Button fullWidth onClick={() => handleExport()}>
              Экспорт ({items.length} {declension(items.length, 'файл', 'файла', 'файлов')})
            </Button>
          </div>
        </div>
      )}

      {/* Progress + cancel */}
      {isExporting && (
        <div
          style={{
            padding: '12px 16px 16px',
            background: 'var(--figma-color-bg)',
            borderTop: '1px solid var(--figma-color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProgressBar pct={progressPct} />
            <span
              class="link-text"
              onClick={handleCancel}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--figma-color-text-danger)',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              Отмена
            </span>
          </div>
          <VerticalSpace space="extraSmall" />
          <Muted>{progress.text}</Muted>
        </div>
      )}

      {/* Download */}
      {phase === 'done' && zipBlob && (
        <div
          style={{
            padding: '12px 16px 16px',
            background: 'var(--figma-color-bg)',
            borderTop: '1px solid var(--figma-color-border)',
          }}
        >
          <div class="export-btn-wrap">
            <style>{`.export-btn-wrap button { padding: 12px 16px !important; font-size: 13px !important; height: auto !important; }`}</style>
            <Button fullWidth onClick={handleDownload}>
              Скачать ZIP
              {exportedFilter?.platform
                ? ` ${exportedFilter.platform}`
                : exportedFilter?.format
                  ? ` ${exportedFilter.format.toUpperCase()}`
                  : ''}{' '}
              · {zipSizeMb} МБ · {exportedCount}{' '}
              {declension(exportedCount, 'файл', 'файла', 'файлов')}
            </Button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <span
              class="link-text"
              onClick={handleRescan}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--figma-color-text-brand)',
                userSelect: 'none',
              }}
            >
              Очистить экспорт
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
