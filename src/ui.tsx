import { Fragment } from 'preact'
import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
import { render } from 'preact'
import { Button, Text, Muted, VerticalSpace } from '@create-figma-plugin/ui'
import type { TreeNode, ExportItem, SectionFormat } from './types'
import JSZip from 'jszip'
import GIF from 'gif.js'
import { track } from './analytics'
import { log, error, fromCodeThread } from './logger'

// gif.worker.js content injected at build time via esbuild define
declare const __GIF_WORKER_CONTENT__: string
let GIF_WORKER_URL: string | null = null
function getGifWorkerUrl(): string {
  if (!GIF_WORKER_URL) {
    const blob = new Blob([__GIF_WORKER_CONTENT__], { type: 'application/javascript' })
    GIF_WORKER_URL = URL.createObjectURL(blob)
  }
  return GIF_WORKER_URL
}

// ── Compression utilities ─────────────────────────────────────────────────────

function pngBytesToCanvas(pngBytes: Uint8Array): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const blob = new Blob([pngBytes as BlobPart], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), mimeType, quality)
  })
}

async function binarySearchQuality(
  canvas: HTMLCanvasElement,
  mimeType: string,
  targetSize: number,
): Promise<Blob> {
  let lo = 0.0,
    hi = 1.0
  let best: Blob | null = null
  async function iterate(n: number): Promise<Blob> {
    if (n <= 0) return best ?? canvasToBlob(canvas, mimeType, 0)
    const mid = (lo + hi) / 2
    const blob = await canvasToBlob(canvas, mimeType, mid)
    if (blob.size <= targetSize) {
      best = blob
      lo = mid
    } else {
      hi = mid
    }
    return iterate(n - 1)
  }
  return iterate(8)
}

async function compressPngToTarget(canvas: HTMLCanvasElement, targetSize: number): Promise<Blob> {
  const { width: w, height: h } = canvas
  const ctx = canvas.getContext('2d')!
  const orig = ctx.getImageData(0, 0, w, h)

  async function quantize(levels: number): Promise<Blob> {
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const tCtx = tmp.getContext('2d')!
    const imgData = tCtx.createImageData(w, h)
    const src = orig.data,
      dst = imgData.data
    const step = 256 / levels
    for (let i = 0; i < src.length; i += 4) {
      dst[i] = Math.round(Math.round(src[i] / step) * step)
      dst[i + 1] = Math.round(Math.round(src[i + 1] / step) * step)
      dst[i + 2] = Math.round(Math.round(src[i + 2] / step) * step)
      dst[i + 3] = src[i + 3]
    }
    tCtx.putImageData(imgData, 0, 0)
    return canvasToBlob(tmp, 'image/png')
  }

  let lo = 2,
    hi = 256,
    best: Blob | null = null
  async function iterate(n: number): Promise<Blob> {
    if (n <= 0) return best ?? quantize(2)
    const mid = Math.floor((lo + hi) / 2)
    const blob = await quantize(mid)
    if (blob.size <= targetSize) {
      best = blob
      lo = mid + 1
    } else {
      hi = mid - 1
    }
    return iterate(n - 1)
  }
  return iterate(8)
}

async function convertFrame(
  pngBytes: Uint8Array,
  format: string,
  limit: number | null,
): Promise<Blob> {
  const canvas = await pngBytesToCanvas(pngBytes)
  if (format === 'png') {
    return limit ? compressPngToTarget(canvas, limit) : canvasToBlob(canvas, 'image/png')
  }
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/webp'
  return limit ? binarySearchQuality(canvas, mimeType, limit) : canvasToBlob(canvas, mimeType, 1.0)
}

async function assembleGif(
  framesData: ArrayBuffer[],
  width: number,
  height: number,
  delay: number,
  limit: number | null,
): Promise<Blob> {
  const canvases = await Promise.all(framesData.map((f) => pngBytesToCanvas(new Uint8Array(f))))

  function renderGif(quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const gif = new GIF({ workers: 2, quality, width, height, workerScript: getGifWorkerUrl() })
      canvases.forEach((c) => gif.addFrame(c, { delay, copy: true }))
      gif.on('finished', resolve)
      gif.on('error', reject)
      gif.render()
    })
  }

  if (!limit) return renderGif(10)

  let lo = 1,
    hi = 30,
    best: Blob | null = null
  for (let i = 0; i < 6; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const blob = await renderGif(mid)
    if (blob.size <= limit) {
      best = blob
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return best ?? renderGif(30)
}

// ── Tag badge ─────────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  jpg: { bg: '#fff3cd', color: '#856404' },
  png: { bg: '#d4edda', color: '#155724' },
  webp: { bg: '#d1ecf1', color: '#0c5460' },
  gif: { bg: '#f8d7da', color: '#721c24' },
}

function TagBadge({ format }: { format: string }) {
  const c = TAG_COLORS[format] ?? { bg: '#eee', color: '#333' }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        textTransform: 'uppercase',
      }}
    >
      {format}
    </span>
  )
}

// ── Guide component ──────────────────────────────────────────────────────────

function SetupGuide() {
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--figma-color-bg-secondary)',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--figma-color-text)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Как настроить страницу</div>
      <div style={{ color: 'var(--figma-color-text-secondary)', marginBottom: 12 }}>
        Плагин ищет на текущей странице вложенные секции с определённой структурой. Создайте 4
        уровня секций:
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {[
          { level: '1', label: 'Формат', desc: 'JPG, PNG, WEBP или GIF', color: '#7B61FF' },
          { level: '2', label: 'Канал', desc: 'например: 5_Context_Media', color: '#0D99FF' },
          { level: '3', label: 'Площадка', desc: 'например: VK, TG, Bigo', color: '#14AE5C' },
          { level: '4', label: 'Креатив', desc: 'например: 1234-card', color: '#F24822' },
        ].map(({ level, label, desc, color }) => (
          <div
            key={level}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: 'var(--figma-color-bg)',
              borderRadius: 6,
              borderLeft: `3px solid ${color}`,
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: color,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {level}
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--figma-color-text-secondary)' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Example tree */}
      <div
        style={{
          padding: '8px 10px',
          background: 'var(--figma-color-bg)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: '17px',
          color: 'var(--figma-color-text-secondary)',
        }}
      >
        <div>JPG</div>
        <div style={{ paddingLeft: 12 }}>5_Context_Media</div>
        <div style={{ paddingLeft: 24 }}>VK</div>
        <div style={{ paddingLeft: 36 }}>1234-card</div>
      </div>

      {/* Naming rules */}
      <div
        style={{
          marginTop: 12,
          padding: '8px 10px',
          background: 'var(--figma-color-bg)',
          borderRadius: 6,
          fontSize: 11,
          lineHeight: '17px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Нейминг креативов</div>
        <div style={{ color: 'var(--figma-color-text-secondary)' }}>
          <span style={{ fontWeight: 600 }}>xxxx</span> — номер задачи в Jira
          <br />
          <span style={{ fontWeight: 600 }}>yyy</span> — условное обозначение креатива
        </div>
        <div style={{ marginTop: 6, color: 'var(--figma-color-text-secondary)' }}>
          <div>
            <span style={{ fontFamily: 'monospace', color: 'var(--figma-color-text)' }}>
              1234-card
            </span>
          </div>
          <div>
            <span style={{ fontFamily: 'monospace', color: 'var(--figma-color-text)' }}>
              1234-skidka
            </span>
          </div>
        </div>
        <div style={{ marginTop: 4, color: 'var(--figma-color-text-secondary)' }}>
          Несколько слов — через точку:
        </div>
        <div style={{ color: 'var(--figma-color-text-secondary)' }}>
          <div>
            <span style={{ fontFamily: 'monospace', color: 'var(--figma-color-text)' }}>
              1234-yellow.card
            </span>
          </div>
          <div>
            <span style={{ fontFamily: 'monospace', color: 'var(--figma-color-text)' }}>
              1234-black.card
            </span>
          </div>
        </div>
      </div>

      {/* Wiki link */}
      <a
        href="https://wiki.tcsbank.ru/pages/viewpage.action?pageId=6135577587"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          marginTop: 8,
          padding: '7px 0',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--figma-color-text-brand)',
          background: 'var(--figma-color-bg)',
          border: '1px solid var(--figma-color-border)',
          borderRadius: 6,
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        Гайд по неймингу
      </a>

      {/* Frame auto-rename note */}
      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          color: 'var(--figma-color-text-secondary)',
        }}
      >
        Имена фреймов (ресайзов) автоматически заменятся на размер фрейма при экспорте (например,{' '}
        <span style={{ fontFamily: 'monospace' }}>1080x1920</span>).
        <br />
        Для GIF: фреймы на одной Y-позиции станут одной анимацией (слева направо).
      </div>
    </div>
  )
}

// ── Search input ─────────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--figma-color-text-tertiary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="Поиск по размеру, формату, названию..."
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '7px 8px 7px 28px',
          border: '1px solid var(--figma-color-border)',
          borderRadius: 6,
          fontSize: 12,
          background: 'var(--figma-color-bg)',
          color: 'var(--figma-color-text)',
          outline: 'none',
        }}
      />
    </div>
  )
}

// ── View toggle icons ─────────────────────────────────────────────────────────

function TreeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="3" y1="2" x2="3" y2="12" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="3.5" x2="7" y2="3.5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="7" x2="9.5" y2="7" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="1.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="5" x2="12.5" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1.5" y1="9" x2="12.5" y2="9" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="5" x2="5" y2="12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

// ── Tree filtering ───────────────────────────────────────────────────────────

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.map((node) => filterNode(node, q)).filter((n): n is TreeNode => n !== null)
}

function filterNode(node: TreeNode, query: string): TreeNode | null {
  if (node.type === 'frame') {
    const matches =
      node.name.toLowerCase().includes(query) ||
      (node.size && node.size.toLowerCase().includes(query))
    return matches ? node : null
  }
  // For non-leaf nodes, check if the node name matches or any children match
  const nameMatches = node.name.toLowerCase().includes(query)
  if (!node.children) return nameMatches ? node : null
  const filteredChildren = node.children
    .map((c) => filterNode(c, query))
    .filter((c): c is TreeNode => c !== null)
  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren }
  }
  return nameMatches ? { ...node, children: [] } : null
}

// ── Flat table rows ───────────────────────────────────────────────────────────

interface FlatRow {
  key: string
  formatTag: string
  channel: string
  platform: string
  creative: string
  frameName: string
  gifFrameInfo?: string
}

function flattenToRows(nodes: TreeNode[]): FlatRow[] {
  const rows: FlatRow[] = []
  for (const fmt of nodes) {
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
}

function filterFlatRows(rows: FlatRow[], query: string): FlatRow[] {
  if (!query) return rows
  const q = query.toLowerCase()
  return rows.filter(
    (r) =>
      r.frameName.toLowerCase().includes(q) ||
      r.formatTag.includes(q) ||
      r.channel.toLowerCase().includes(q) ||
      r.platform.toLowerCase().includes(q) ||
      r.creative.toLowerCase().includes(q),
  )
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface TreeNodeViewProps {
  node: TreeNode
  formatTag: string
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, value: string) => void
  depth?: number
  defaultExpanded?: boolean
}

function FrameRow({
  node,
  formatTag,
  frameSizes,
  onFrameSizeChange,
}: {
  node: TreeNode
  formatTag: string
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, value: string) => void
}) {
  const key = `${node.name}_${formatTag}`
  const nameNoExt = node.name.replace(/\.[^.]+$/, '')
  const gifInfo = formatTag === 'gif' ? node.size?.match(/\(\d+ frames?\)/) : null
  const inputRef = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState(false)

  function handleInput(e: Event) {
    const el = e.target as HTMLInputElement
    const raw = el.value
    const filtered = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const dotIdx = filtered.indexOf('.')
    const sanitized =
      dotIdx === -1
        ? filtered
        : filtered.slice(0, dotIdx + 1) + filtered.slice(dotIdx + 1).replace(/\./g, '')
    if (sanitized !== raw) el.value = sanitized
    onFrameSizeChange(key, sanitized)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0 3px 8px',
        borderRadius: 4,
        cursor: 'default',
        background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => inputRef.current?.focus()}
    >
      <span style={{ flex: 1, fontSize: 11, color: 'var(--figma-color-text)' }}>
        {nameNoExt}
        {gifInfo && (
          <span style={{ fontSize: 10, color: 'var(--figma-color-text-tertiary)', marginLeft: 4 }}>
            {gifInfo[0]}
          </span>
        )}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={frameSizes[key] ?? ''}
        onChange={handleInput}
        onBlur={() => {
          let v = frameSizes[key] ?? ''
          if (v.endsWith('.')) v = v.slice(0, -1)
          if (v !== '' && parseFloat(v) <= 0) v = ''
          if (v !== (frameSizes[key] ?? '')) onFrameSizeChange(key, v)
        }}
        style={{
          width: 48,
          border: '1px solid var(--figma-color-border)',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 10,
          background: 'var(--figma-color-bg-secondary)',
          color: 'var(--figma-color-text)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: 'var(--figma-color-text-disabled)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        МБ
      </span>
    </div>
  )
}

function TableRow({
  row,
  frameSizes,
  onFrameSizeChange,
}: {
  row: FlatRow
  frameSizes: Record<string, string>
  onFrameSizeChange: (key: string, value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState(false)

  function handleInput(e: Event) {
    const el = e.target as HTMLInputElement
    const raw = el.value
    const filtered = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const dotIdx = filtered.indexOf('.')
    const sanitized =
      dotIdx === -1
        ? filtered
        : filtered.slice(0, dotIdx + 1) + filtered.slice(dotIdx + 1).replace(/\./g, '')
    if (sanitized !== raw) el.value = sanitized
    onFrameSizeChange(row.key, sanitized)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 12px',
        background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => inputRef.current?.focus()}
    >
      <div style={{ flexShrink: 0 }}>
        <TagBadge format={row.formatTag} />
      </div>
      <span
        style={{
          flex: 1,
          fontSize: 11,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          color: 'var(--figma-color-text)',
        }}
        title={`${row.channel} › ${row.platform} › ${row.creative}`}
      >
        {row.creative}
      </span>
      <span
        style={{
          width: 64,
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--figma-color-text-secondary)',
          textAlign: 'right',
        }}
      >
        {row.frameName}
        {row.gifFrameInfo && (
          <span style={{ fontSize: 9, marginLeft: 2, color: 'var(--figma-color-text-tertiary)' }}>
            {row.gifFrameInfo}
          </span>
        )}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={frameSizes[row.key] ?? ''}
        onChange={handleInput}
        onBlur={() => {
          let v = frameSizes[row.key] ?? ''
          if (v.endsWith('.')) v = v.slice(0, -1)
          if (v !== '' && parseFloat(v) <= 0) v = ''
          if (v !== (frameSizes[row.key] ?? '')) onFrameSizeChange(row.key, v)
        }}
        style={{
          width: 48,
          flexShrink: 0,
          border: '1px solid var(--figma-color-border)',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 10,
          background: 'var(--figma-color-bg-secondary)',
          color: 'var(--figma-color-text)',
          textAlign: 'right',
          outline: 'none',
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: 'var(--figma-color-text-disabled)',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        МБ
      </span>
    </div>
  )
}

function TreeNodeView({
  node,
  formatTag,
  frameSizes,
  onFrameSizeChange,
  depth = 0,
  defaultExpanded = true,
}: TreeNodeViewProps) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded)
  const currentFormat = node.type === 'format' ? node.name.toLowerCase() : formatTag

  if (node.type === 'frame') {
    return (
      <FrameRow
        node={node}
        formatTag={formatTag}
        frameSizes={frameSizes}
        onFrameSizeChange={onFrameSizeChange}
      />
    )
  }

  const hasChildren = node.children && node.children.length > 0

  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      <div
        style={{
          cursor: hasChildren ? 'pointer' : 'default',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 4px',
          borderRadius: 4,
          ...(node.type === 'format'
            ? { position: 'sticky', top: 0, background: 'var(--figma-color-bg)', zIndex: 1 }
            : {}),
        }}
        onClick={() => hasChildren && setCollapsed(!collapsed)}
      >
        {hasChildren && (
          <span
            style={{
              display: 'inline-block',
              width: 10,
              fontSize: 8,
              transition: 'transform 0.15s',
              transform: collapsed ? 'rotate(-90deg)' : 'none',
              color: 'var(--figma-color-text-tertiary)',
            }}
          >
            ▼
          </span>
        )}
        <span style={{ fontWeight: node.type === 'format' ? 600 : 400, fontSize: 12 }}>
          {node.name}
        </span>
        {node.type === 'format' && <TagBadge format={currentFormat} />}
        {hasChildren && (
          <span style={{ fontSize: 10, color: 'var(--figma-color-text-tertiary)', marginLeft: 2 }}>
            {countFrames(node)}
          </span>
        )}
      </div>
      {!collapsed && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNodeView
              key={i}
              node={child}
              formatTag={currentFormat}
              frameSizes={frameSizes}
              onFrameSizeChange={onFrameSizeChange}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function countFrames(node: TreeNode): string {
  let count = 0
  function walk(n: TreeNode) {
    if (n.type === 'frame') count++
    n.children?.forEach(walk)
  }
  walk(node)
  return `${count}`
}

// ── Inline number input (Figma-styled) ────────────────────────────────────────

function NumInput({
  value,
  onChange,
  width = 60,
  suffix,
}: {
  value: string
  onChange: (v: string) => void
  width?: number
  suffix?: string
}) {
  function handleInput(e: Event) {
    const el = e.target as HTMLInputElement
    const raw = el.value
    const filtered = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const dotIdx = filtered.indexOf('.')
    const sanitized =
      dotIdx === -1
        ? filtered
        : filtered.slice(0, dotIdx + 1) + filtered.slice(dotIdx + 1).replace(/\./g, '')
    if (sanitized !== raw) el.value = sanitized
    onChange(sanitized)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={handleInput}
        onBlur={() => {
          let v = value
          if (v.endsWith('.')) v = v.slice(0, -1)
          if (v !== '' && parseFloat(v) <= 0) v = ''
          if (v !== value) onChange(v)
        }}
        style={{
          width,
          border: '1px solid var(--figma-color-border)',
          borderRadius: 4,
          padding: '4px 6px',
          fontSize: 11,
          background: 'var(--figma-color-bg-secondary)',
          color: 'var(--figma-color-text)',
        }}
      />
      {suffix && (
        <span
          style={{ fontSize: 11, color: 'var(--figma-color-text-disabled)', userSelect: 'none' }}
        >
          {suffix}
        </span>
      )}
    </div>
  )
}

// ── HTML preview builder ──────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPreviewHtml(paths: string[]): string {
  // Group paths into a tree by folder segments
  type FileNode = { name: string; children: FileNode[]; filePath?: string }
  const root: FileNode = { name: '', children: [] }

  for (const p of paths) {
    const parts = p.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      let child = node.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, children: [] }
        node.children.push(child)
      }
      if (i === parts.length - 1) child.filePath = p
      node = child
    }
  }

  function renderNode(node: FileNode, depth: number): string {
    if (node.filePath) {
      // Leaf = image
      const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
      const isGif = ext === 'gif'
      return `<figure class="item">
  <div class="img-wrap">
    <img src="${escHtml(node.filePath)}" alt="${escHtml(node.name)}" loading="lazy"${isGif ? '' : ''}>
  </div>
  <figcaption>${escHtml(node.name)}</figcaption>
</figure>`
    }
    // Group node
    const tag = depth === 0 ? 'section' : 'div'
    const cls = `group depth-${depth}`
    const children = node.children.map((c) => renderNode(c, depth + 1)).join('\n')
    // Check if this group contains only leaves (= render as grid)
    const allLeaves = node.children.every((c) => !!c.filePath)
    if (allLeaves) {
      return `<${tag} class="${cls}">
  <h${Math.min(depth + 1, 6)} class="group-title">${escHtml(node.name)}</h${Math.min(depth + 1, 6)}>
  <div class="grid">${children}</div>
</${tag}>`
    }
    return `<${tag} class="${cls}">
  <h${Math.min(depth + 1, 6)} class="group-title">${escHtml(node.name)}</h${Math.min(depth + 1, 6)}>
  ${children}
</${tag}>`
  }

  const body = root.children.map((c) => renderNode(c, 0)).join('\n')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Export Preview</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1a1a1a; background: #f5f5f5; padding: 24px; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #111; }
  .group { margin-bottom: 24px; }
  .group-title { font-weight: 600; color: #555; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; }
  h1.group-title { font-size: 16px; color: #111; }
  h2.group-title { font-size: 14px; }
  h3.group-title { font-size: 13px; }
  h4.group-title, h5.group-title, h6.group-title { font-size: 12px; color: #888; }
  .depth-0 { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .depth-1 { margin-bottom: 16px; }
  .depth-2 { margin-bottom: 12px; padding-left: 12px; border-left: 2px solid #e8e8e8; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .img-wrap { background: repeating-conic-gradient(#e0e0e0 0% 25%, #f5f5f5 0% 50%) 0 0 / 12px 12px; border-radius: 6px; overflow: hidden; border: 1px solid #e0e0e0; display: flex; align-items: center; justify-content: center; max-width: 200px; max-height: 200px; }
  .img-wrap img { display: block; max-width: 200px; max-height: 200px; object-fit: contain; }
  figcaption { font-size: 11px; color: #888; text-align: center; max-width: 200px; word-break: break-all; }
</style>
</head>
<body>
<h1>Export Preview</h1>
${body}
</body>
</html>`
}

// ── Segmented control ─────────────────────────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid var(--figma-color-border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: 11,
            fontWeight: opt.value === value ? 600 : 400,
            border: 'none',
            borderRight:
              opt.value === options[options.length - 1].value
                ? 'none'
                : '1px solid var(--figma-color-border)',
            cursor: 'pointer',
            background:
              opt.value === value ? 'var(--figma-color-bg-brand)' : 'var(--figma-color-bg)',
            color:
              opt.value === value ? 'var(--figma-color-text-onbrand)' : 'var(--figma-color-text)',
            transition: 'background 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'empty' | 'ready' | 'exporting' | 'done'
type AppScreen = 'main' | 'resize-limits'

function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [screen, setScreen] = useState<AppScreen>('main')
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

  function resolvePath(path: string): string {
    return path.split('/').slice(1).join('/')
  }

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
    return null
  }

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data?.pluginMessage
      if (!msg) return

      if (msg.type === 'scan-result') {
        const { tree: newTree, items: newItems } = msg as { tree: TreeNode[]; items: ExportItem[] }
        setTree(newTree)
        setItems(newItems)
        itemsRef.current = newItems
        if (!openTrackedRef.current) {
          openTrackedRef.current = true
          track('plugin_opened', { frame_count: newItems.length, has_frames: newItems.length > 0 })
        }
        log('scan-result', { frame_count: newItems.length })
        setPhase((prev) => (prev === 'exporting' ? prev : newTree.length > 0 ? 'ready' : 'empty'))
      }

      if (msg.type === 'rename-done') {
        cancelledRef.current = false
        setProgress({ current: 0, total: activeCountRef.current, text: 'Начинаем экспорт...' })
        parent.postMessage({ pluginMessage: { type: 'start-export' } }, '*')
      }

      if (msg.type === 'frame-data') {
        const { index, total, path, format, pngBytes, platformName } = msg as {
          index: number
          total: number
          path: string
          format: string
          pngBytes: ArrayBuffer
          platformName: string
        }
        const limit = getLimit(path.split('/').pop()!, format, platformName)
        setProgress({ current: index + 1, total, text: `Обработка ${index + 1}/${total}: ${path}` })
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
          parent.postMessage({ pluginMessage: { type: 'request-frame', index: index + 1 } }, '*')
        }
      }

      if (msg.type === 'gif-data') {
        const { index, total, path, frames, width, height, platformName } = msg as {
          index: number
          total: number
          path: string
          frames: ArrayBuffer[]
          width: number
          height: number
          platformName: string
        }
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
          parent.postMessage({ pluginMessage: { type: 'request-frame', index: index + 1 } }, '*')
        }
      }

      if (msg.type === 'log') {
        fromCodeThread(msg.level ?? 'log', msg.message, msg.data)
      }

      if (msg.type === 'export-complete') {
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
      }
    }

    window.addEventListener('message', handler)
    // Request initial scan now that the listener is registered
    parent.postMessage({ pluginMessage: { type: 'scan' } }, '*')
    return () => window.removeEventListener('message', handler)
  }, [])

  function handleRescan() {
    setSearch('')
    parent.postMessage({ pluginMessage: { type: 'scan' } }, '*')
  }

  function handleExport(filter?: { format?: string; platform?: string }) {
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
    parent.postMessage(
      {
        pluginMessage: {
          type: 'rename-frames',
          filterFormat: filter?.format,
          filterPlatform: filter?.platform,
        },
      },
      '*',
    )
  }

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
      <div style={{ padding: 12 }}>
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
        <div
          style={{
            borderBottom: '1px solid var(--figma-color-border)',
            background: 'var(--figma-color-bg)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
            <span
              onClick={() => setScreen('main')}
              style={{
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                color: 'var(--figma-color-text-secondary)',
                userSelect: 'none',
                padding: '0 4px',
              }}
            >
              ←
            </span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Лимиты по ресайзам</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 0 }}>
              {(
                [
                  { key: 'tree', icon: <TreeIcon /> },
                  { key: 'table', icon: <TableIcon /> },
                ] as const
              ).map(({ key, icon }, idx) => (
                <button
                  key={key}
                  onClick={() => setResizeLimitsView(key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 22,
                    border: '1px solid var(--figma-color-border)',
                    borderLeft: idx > 0 ? 'none' : '1px solid var(--figma-color-border)',
                    borderRadius: idx === 0 ? '4px 0 0 4px' : '0 4px 4px 0',
                    background:
                      resizeLimitsView === key
                        ? 'var(--figma-color-bg-selected)'
                        : 'var(--figma-color-bg)',
                    color:
                      resizeLimitsView === key
                        ? 'var(--figma-color-text)'
                        : 'var(--figma-color-text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '0 12px 6px' }}>
            <SearchInput value={search} onChange={setSearch} />
          </div>
        </div>

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
                  onFrameSizeChange={(key, val) =>
                    setFrameSizes((prev) => ({ ...prev, [key]: val }))
                  }
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 12px',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--figma-color-bg)',
                  zIndex: 1,
                  borderBottom: '1px solid var(--figma-color-border)',
                }}
              >
                <span
                  style={{ width: 36, fontSize: 10, color: 'var(--figma-color-text-tertiary)' }}
                >
                  Формат
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 10,
                    color: 'var(--figma-color-text-tertiary)',
                    minWidth: 0,
                  }}
                >
                  Креатив
                </span>
                <span
                  style={{
                    width: 64,
                    fontSize: 10,
                    color: 'var(--figma-color-text-tertiary)',
                    textAlign: 'right',
                  }}
                >
                  Ресайз
                </span>
                <span
                  style={{
                    width: 48,
                    fontSize: 10,
                    color: 'var(--figma-color-text-tertiary)',
                    textAlign: 'right',
                  }}
                >
                  Лимит
                </span>
                <span style={{ width: 20 }} />
              </div>
              {filteredFlatRows.map((row, i) => (
                <TableRow
                  key={i}
                  row={row}
                  frameSizes={frameSizes}
                  onFrameSizeChange={(key, val) =>
                    setFrameSizes((prev) => ({ ...prev, [key]: val }))
                  }
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
        <button
          onClick={() => setScreen('resize-limits')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            border: '1px solid var(--figma-color-border)',
            borderRadius: 6,
            background: 'var(--figma-color-bg-secondary)',
            color: 'var(--figma-color-text)',
            fontSize: 12,
            cursor: 'pointer',
            marginBottom: 0,
          }}
        >
          <span style={{ fontWeight: 600 }}>Ресайзы</span>
          <span style={{ color: 'var(--figma-color-text-tertiary)', fontSize: 11 }}>
            {items.length} {declension(items.length, 'файл', 'файла', 'файлов')} ›
          </span>
        </button>

        {/* Platform limits */}
        {formatPlatforms.length > 0 && (
          <Fragment>
            <VerticalSpace space="small" />
            <Text>
              <strong>Лимиты по площадкам</strong>
            </Text>
            <VerticalSpace space="small" />
            <div
              style={{
                border: '1px solid var(--figma-color-border)',
                borderRadius: 6,
                padding: 8,
              }}
            >
              {formatPlatforms.map(({ format, platforms }) => (
                <Fragment key={format}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <button
                      onClick={() => !isExporting && handleExport({ format })}
                      disabled={isExporting}
                      title={`Экспортировать только ${format.toUpperCase()}`}
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        border: '1px solid var(--figma-color-border)',
                        borderRadius: 4,
                        background: 'var(--figma-color-bg-secondary)',
                        color: isExporting
                          ? 'var(--figma-color-text-disabled)'
                          : 'var(--figma-color-text)',
                        cursor: isExporting ? 'default' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      ↓
                    </button>
                    <TagBadge format={format} />
                  </div>
                  {platforms.map((name) => (
                    <div
                      key={name}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                    >
                      <button
                        onClick={() => !isExporting && handleExport({ format, platform: name })}
                        disabled={isExporting}
                        title={`Экспортировать ${format.toUpperCase()} / ${name}`}
                        style={{
                          width: 22,
                          height: 22,
                          padding: 0,
                          fontSize: 12,
                          border: '1px solid var(--figma-color-border)',
                          borderRadius: 4,
                          background: 'var(--figma-color-bg-secondary)',
                          color: isExporting
                            ? 'var(--figma-color-text-disabled)'
                            : 'var(--figma-color-text)',
                          cursor: isExporting ? 'default' : 'pointer',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        ↓
                      </button>
                      <div style={{ flex: 1 }}>
                        <Text>{name}</Text>
                      </div>
                      <NumInput
                        value={platformSizes[`${format}/${name}`] ?? ''}
                        onChange={(v) =>
                          setPlatformSizes((prev) => ({ ...prev, [`${format}/${name}`]: v }))
                        }
                        suffix="МБ"
                      />
                    </div>
                  ))}
                  <VerticalSpace space="extraSmall" />
                </Fragment>
              ))}
            </div>
          </Fragment>
        )}

        {/* GIF delay */}
        {hasGif && (
          <Fragment>
            <VerticalSpace space="small" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text>Задержка GIF</Text>
              <NumInput value={gifDelay} onChange={setGifDelay} width={60} suffix="сек" />
            </div>
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
            <div
              style={{
                flex: 1,
                height: 6,
                background: 'var(--figma-color-bg-secondary)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: 'var(--figma-color-bg-brand)',
                  width: `${progressPct}%`,
                  transition: 'width 0.2s',
                }}
              />
            </div>
            <span
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

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: 'export' | 'organize'
  onChange: (t: 'export' | 'organize') => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--figma-color-border)',
        background: 'var(--figma-color-bg)',
        flexShrink: 0,
      }}
    >
      {(
        [
          { key: 'export', label: 'Экспорт' },
          { key: 'organize', label: 'Разместить' },
        ] as const
      ).map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderBottom:
              active === key ? '2px solid var(--figma-color-bg-brand)' : '2px solid transparent',
            background: 'transparent',
            color: active === key ? 'var(--figma-color-text)' : 'var(--figma-color-text-secondary)',
            fontSize: 12,
            fontWeight: active === key ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Combobox dropdown shared styles ───────────────────────────────────────────

function ComboboxDropdown({
  options,
  onSelect,
}: {
  options: string[]
  onSelect: (v: string) => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'var(--figma-color-bg)',
        border: '1px solid var(--figma-color-border)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxHeight: 160,
        overflowY: 'auto',
        marginTop: 2,
      }}
    >
      {options.map((o) => (
        <div
          key={o}
          onMouseDown={() => onSelect(o)}
          style={{
            padding: '6px 8px',
            fontSize: 11,
            cursor: 'pointer',
            color: 'var(--figma-color-text)',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLDivElement).style.background = 'var(--figma-color-bg-hover)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLDivElement).style.background = 'transparent')
          }
        >
          {o}
        </div>
      ))}
    </div>
  )
}

// ── Path field (combobox with label) ─────────────────────────────────────────

function PathField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: 72,
          fontSize: 11,
          color: 'var(--figma-color-text-secondary)',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '5px 8px',
            border: '1px solid var(--figma-color-border)',
            borderRadius: 4,
            fontSize: 11,
            background: 'var(--figma-color-bg)',
            color: 'var(--figma-color-text)',
            outline: 'none',
          }}
        />
        {open && filtered.length > 0 && (
          <ComboboxDropdown
            options={filtered}
            onSelect={(o) => {
              onChange(o)
              setOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Path input (combobox without label, slash-path autocomplete) ───────────────

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

function PathInput({
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

  function handleSelect(completion: string) {
    // If less than 4 parts, append "/" to prompt next segment
    const completionParts = completion.split('/')
    onChange(completionParts.length < 4 ? completion + '/' : completion)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        placeholder="GIF/Канал/Площадка/Креатив"
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '5px 8px',
          border: '1px solid var(--figma-color-border)',
          borderRadius: 4,
          fontSize: 11,
          background: 'var(--figma-color-bg)',
          color: 'var(--figma-color-text)',
          outline: 'none',
          fontFamily: 'monospace',
        }}
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

// ── Organize page ─────────────────────────────────────────────────────────────

function OrganizePage() {
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
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage
      if (!msg) return
      if (msg.type === 'sections-data') setSections(msg.sections as SectionFormat[])
      if (msg.type === 'selection-change') setSelectedCount(msg.count as number)
      if (msg.type === 'place-result') {
        setResult({ success: msg.success as boolean, message: msg.message as string })
      }
    }
    window.addEventListener('message', handler)
    parent.postMessage({ pluginMessage: { type: 'get-sections' } }, '*')
    return () => window.removeEventListener('message', handler)
  }, [])

  // Derived autocomplete options for fields mode
  const formatSection = sections.find((s) => s.name.toLowerCase() === format.toLowerCase())
  const channelOptions = formatSection ? formatSection.channels.map((c) => c.name) : []
  const channelSection = formatSection?.channels.find((c) => c.name === channel)
  const platformOptions = channelSection ? channelSection.platforms.map((p) => p.name) : []
  const platformSection = channelSection?.platforms.find((p) => p.name === platform)
  const creativeOptions = platformSection ? platformSection.creatives : []

  // Effective values based on mode
  function getEffectiveValues() {
    if (inputMode === 'fields') {
      return { fmt: format.trim(), ch: channel.trim(), pl: platform.trim(), cr: creative.trim() }
    }
    const parts = pathInput.split('/').map((s) => s.trim())
    return { fmt: parts[0] || '', ch: parts[1] || '', pl: parts[2] || '', cr: parts[3] || '' }
  }

  const { fmt: eFmt, ch: eCh, pl: ePl, cr: eCr } = getEffectiveValues()
  const canPlace = !!(eFmt && eCh && ePl && eCr && selectedCount > 0)

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
    parent.postMessage(
      {
        pluginMessage: {
          type: 'place-frames',
          formatName: fmt,
          channelName: ch,
          platformName: pl,
          creativeName: cr,
        },
      },
      '*',
    )
  }

  return (
    <div style={{ padding: 12, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}>
      {/* Selection indicator */}
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
          onClick={() => parent.postMessage({ pluginMessage: { type: 'align-sections' } }, '*')}
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

      {/* Input mode toggle */}
      <SegmentedControl
        value={inputMode}
        options={[
          { value: 'fields', label: 'По полям' },
          { value: 'path', label: 'Путь' },
        ]}
        onChange={setInputMode}
      />
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
      {result && (
        <Fragment>
          <VerticalSpace space="extraSmall" />
          <div
            style={{
              padding: '7px 10px',
              background: result.success ? '#d4edda' : '#f8d7da',
              borderRadius: 6,
              fontSize: 11,
              color: result.success ? '#155724' : '#721c24',
            }}
          >
            {result.message}
          </div>
        </Fragment>
      )}

      {/* Section tree with add buttons */}
      {sections.length > 0 && (
        <SectionTreePanel sections={sections} onPlace={doPlace} selectedCount={selectedCount} />
      )}
    </div>
  )
}

// ── Section tree panel ────────────────────────────────────────────────────────

function SectionTreePanel({
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
      <SearchInput value={query} onChange={setQuery} />
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

// ── Section tree ──────────────────────────────────────────────────────────────

function SectionTree({
  sections,
  searchQuery,
  onPlace,
  selectedCount,
}: {
  sections: SectionFormat[]
  searchQuery: string
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const q = searchQuery.toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  return (
    <div
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        border: '1px solid var(--figma-color-border)',
        borderRadius: 6,
        padding: '4px 0',
        fontSize: 11,
      }}
    >
      {sections.map((fmt) => {
        const visibleChannels = fmt.channels.filter(
          (ch) =>
            matches(fmt.name) ||
            matches(ch.name) ||
            ch.platforms.some((pl) => matches(pl.name) || pl.creatives.some(matches)),
        )
        if (visibleChannels.length === 0 && !matches(fmt.name)) return null
        return (
          <SectionFormatNode
            key={fmt.name}
            fmt={fmt}
            visibleChannels={visibleChannels}
            matches={matches}
            onPlace={onPlace}
            selectedCount={selectedCount}
          />
        )
      })}
    </div>
  )
}

function SectionFormatNode({
  fmt,
  visibleChannels,
  matches,
  onPlace,
  selectedCount,
}: {
  fmt: SectionFormat
  visibleChannels: SectionFormat['channels']
  matches: (s: string) => boolean
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          userSelect: 'none',
          fontWeight: 600,
        }}
      >
        <span
          style={{
            fontSize: 8,
            color: 'var(--figma-color-text-tertiary)',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            display: 'inline-block',
            width: 10,
            transition: 'transform 0.12s',
          }}
        >
          ▼
        </span>
        <TagBadge format={fmt.name.toLowerCase()} />
        <span style={{ marginLeft: 2 }}>{fmt.name}</span>
      </div>
      {!collapsed &&
        visibleChannels.map((ch) => (
          <SectionChannelNode
            key={ch.name}
            ch={ch}
            formatName={fmt.name}
            matches={matches}
            onPlace={onPlace}
            selectedCount={selectedCount}
          />
        ))}
    </div>
  )
}

function SectionChannelNode({
  ch,
  formatName,
  matches,
  onPlace,
  selectedCount,
}: {
  ch: { name: string; platforms: { name: string; creatives: string[] }[] }
  formatName: string
  matches: (s: string) => boolean
  onPlace: (fmt: string, ch: string, pl: string, cr: string) => void
  selectedCount: number
}) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div style={{ paddingLeft: 14 }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px 3px 0',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: 8,
            color: 'var(--figma-color-text-tertiary)',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            display: 'inline-block',
            width: 10,
            transition: 'transform 0.12s',
          }}
        >
          ▼
        </span>
        <span style={{ color: 'var(--figma-color-text)' }}>{ch.name}</span>
      </div>
      {!collapsed &&
        ch.platforms.map((pl) => {
          const visibleCreatives = pl.creatives.filter(
            (cr) => matches(ch.name) || matches(pl.name) || matches(cr),
          )
          if (visibleCreatives.length === 0 && !matches(pl.name)) return null
          return (
            <div key={pl.name} style={{ paddingLeft: 14 }}>
              <div
                style={{
                  padding: '2px 0',
                  color: 'var(--figma-color-text-secondary)',
                  fontStyle: 'italic',
                  fontSize: 10,
                }}
              >
                {pl.name}
              </div>
              {visibleCreatives.map((cr) => (
                <CreativeRow
                  key={cr}
                  name={cr}
                  onAdd={() => onPlace(formatName, ch.name, pl.name, cr)}
                  enabled={selectedCount > 0}
                />
              ))}
            </div>
          )
        })}
    </div>
  )
}

function CreativeRow({
  name,
  onAdd,
  enabled,
}: {
  name: string
  onAdd: () => void
  enabled: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px 2px 0',
        borderRadius: 3,
        background: hovered ? 'var(--figma-color-bg-hover)' : 'transparent',
      }}
    >
      <span
        style={{ flex: 1, color: 'var(--figma-color-text-tertiary)', fontSize: 10, paddingLeft: 2 }}
      >
        {name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (enabled) onAdd()
        }}
        title={enabled ? 'Добавить выделенные фреймы' : 'Выделите фреймы на странице'}
        style={{
          width: 18,
          height: 18,
          border: 'none',
          borderRadius: 3,
          background: enabled && hovered ? 'var(--figma-color-bg-brand)' : 'transparent',
          color: enabled ? 'var(--figma-color-text-brand)' : 'var(--figma-color-text-disabled)',
          fontSize: 14,
          lineHeight: '16px',
          cursor: enabled ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
        }}
      >
        +
      </button>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

function Root() {
  const [activeTab, setActiveTab] = useState<'export' | 'organize'>('export')

  useEffect(() => {
    if (activeTab === 'organize') {
      parent.postMessage({ pluginMessage: { type: 'get-sections' } }, '*')
    }
  }, [activeTab])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`html, body, #create-figma-plugin { height: 100%; overflow: hidden; }`}</style>
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
        <App />
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

function declension(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const lastDigit = abs % 10
  if (abs > 10 && abs < 20) return many
  if (lastDigit > 1 && lastDigit < 5) return few
  if (lastDigit === 1) return one
  return many
}

// ── Resize handle ─────────────────────────────────────────────────────────────

function ResizeHandle() {
  function onMouseDown(e: MouseEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = window.innerHeight

    function onMove(ev: MouseEvent) {
      const newH = Math.max(200, startH + (ev.clientY - startY))
      parent.postMessage({ pluginMessage: { type: 'resize', height: Math.round(newH) } }, '*')
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: 16,
        height: 16,
        cursor: 'nwse-resize',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 2,
        zIndex: 100,
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d="M7 1L1 7M7 4L4 7"
          stroke="var(--figma-color-text-tertiary)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

try {
  const root = document.getElementById('create-figma-plugin')
  render(<Root />, root!)
} catch (e) {
  console.error('[export-prod] render error:', e)
  document.body.innerHTML = `<div style="color:red;padding:16px;font-size:12px">Render error: ${e}</div>`
}
