import { useState, useEffect } from 'react'
import { render } from '@create-figma-plugin/ui'
import { emit, on } from '@create-figma-plugin/utilities'
import { ExportPage } from '../pages/export/ui/ExportPage'
import { OrganizePage } from '../pages/organize/ui/OrganizePage'
import { TabBar } from '../shared/ui/TabBar'
import { ResizeHandle } from '../shared/ui/ResizeHandle'

/**
 * Root UI component. Renders the tab bar, export/organize tab panels, and the resize handle.
 * Tab panels are kept mounted and toggled with `display` to preserve their state on tab switch.
 * Emits `get-sections` when switching to the organize tab so it gets fresh section data.
 */
function Root() {
  const [activeTab, setActiveTab] = useState<'export' | 'organize'>('export')

  useEffect(() => {
    if (activeTab === 'organize') {
      emit('get-sections')
    }
  }, [activeTab])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        html, body, #create-figma-plugin { height: 100%; overflow: hidden; }
        .tab-btn:not(.tab-active):hover { background: var(--figma-color-bg-hover) !important; }
        .tab-btn:not(.tab-active):active { background: var(--figma-color-bg-selected) !important; }
        .btn-icon:not(:disabled):not(.btn-active):hover { background: var(--figma-color-bg-hover) !important; }
        .btn-icon:not(:disabled):not(.btn-active):active { filter: brightness(0.9); }
        .link-text:hover { opacity: 0.75; }
        .link-text:active { opacity: 0.5; }
        .back-row { cursor: pointer; user-select: none; }
        .back-row:hover { background: var(--figma-color-bg-hover); }
        .back-row:active { background: var(--figma-color-bg-selected); }
        .tree-header:hover { background: var(--figma-color-bg-hover); border-radius: 4px; }
        .tree-header:active { background: var(--figma-color-bg-selected); border-radius: 4px; }
        .limit-row { border-radius: 4px; }
        .limit-row:hover { background: var(--figma-color-bg-hover); }
        .limit-row:active { background: var(--figma-color-bg-selected); }
        .segmented_control_input:checked ~ .segmented_control_box { background-color: var(--figma-color-bg-brand) !important; color: var(--figma-color-text-onbrand) !important; border-color: var(--figma-color-bg-brand) !important; }
        .segmented_control_segmentedControl label { cursor: pointer; }
        .segmented_control_segmentedControl label:not(:has(.segmented_control_input:checked)):hover { background-color: var(--figma-color-bg-hover); }
        .segmented_control_segmentedControl label:not(:has(.segmented_control_input:checked)):active { background-color: var(--figma-color-bg-selected); }
        .seg-full .segmented_control_segmentedControl { width: 100%; }
        .seg-full .segmented_control_segmentedControl label { flex: 1; }
        .seg-full .segmented_control_box { width: 100%; justify-content: center; }
        input[type="text"] { outline: none; }
        input[type="text"]:hover:not(:focus) { border-color: var(--figma-color-border-strong) !important; }
        input[type="text"]:focus { border-color: var(--figma-color-bg-brand) !important; box-shadow: inset 0 0 0 1px var(--figma-color-bg-brand); }
      `}</style>
      <TabBar active={activeTab} onChange={setActiveTab} />
      <div
        style={{
          display: activeTab === 'export' ? 'flex' : 'none',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <ExportPage />
      </div>
      <div
        style={{
          display: activeTab === 'organize' ? 'block' : 'none',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <OrganizePage />
      </div>
      <ResizeHandle />
    </div>
  )
}

// Register a fallback handler so invokeEventHandler doesn't throw if
// 'selection-change' arrives before OrganizePage.useEffect registers its handler.
// OrganizePage registers its own on('selection-change', ...) which will also fire.
on('selection-change', () => {})

try {
  const rootEl = document.getElementById('create-figma-plugin')
  if (rootEl) render(Root)(rootEl, {})
} catch (e) {
  console.error('[export-prod] render error:', e)
  document.body.innerHTML = `<div style="color:red;padding:16px;font-size:12px">Render error: ${e}</div>`
}
