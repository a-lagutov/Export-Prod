import { Fragment } from 'preact'
import { useState, useEffect, useRef, useMemo } from 'preact/hooks'
import { render } from 'preact'
import { Button, Text, Muted, VerticalSpace, Divider } from '@create-figma-plugin/ui'
import type { TreeNode, ExportItem } from './types'
import JSZip from 'jszip'
import GIF from 'gif.js'

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
    const blob = new Blob([pngBytes], { type: 'image/png' })
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
        type="number"
        placeholder="0"
        min="0"
        step="any"
        value={frameSizes[key] ?? ''}
        onChange={(e) => onFrameSizeChange(key, (e.target as HTMLInputElement).value)}
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
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        placeholder="0"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
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
    <img src="${node.filePath}" alt="${node.name}" loading="lazy"${isGif ? '' : ''}>
  </div>
  <figcaption>${node.name}</figcaption>
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
  <h${Math.min(depth + 1, 6)} class="group-title">${node.name}</h${Math.min(depth + 1, 6)}>
  <div class="grid">${children}</div>
</${tag}>`
    }
    return `<${tag} class="${cls}">
  <h${Math.min(depth + 1, 6)} class="group-title">${node.name}</h${Math.min(depth + 1, 6)}>
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

function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [items, setItems] = useState<ExportItem[]>([])
  const [platformSizes, setPlatformSizes] = useState<Record<string, string>>({})
  const [frameSizes, setFrameSizes] = useState<Record<string, string>>({})
  const [gifDelay, setGifDelay] = useState('3')
  const [progress, setProgress] = useState({ current: 0, total: 0, text: '' })
  const [zipBlob, setZipBlob] = useState<Blob | null>(null)
  const [search, setSearch] = useState('')
  const [pathMode, setPathMode] = useState<'with-format' | 'without-format'>('with-format')

  // Refs for access inside async message handlers without stale closure issues
  const itemsRef = useRef<ExportItem[]>([])
  const platformSizesRef = useRef<Record<string, string>>({})
  const frameSizesRef = useRef<Record<string, string>>({})
  const gifDelayRef = useRef('3')
  const pathModeRef = useRef<'with-format' | 'without-format'>('with-format')
  const cancelledRef = useRef(false)
  const exportedFilesRef = useRef<string[]>([])
  const zipRef = useRef<JSZip | null>(null)

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
  useEffect(() => {
    pathModeRef.current = pathMode
  }, [pathMode])

  function resolvePath(path: string): string {
    return pathModeRef.current === 'without-format' ? path.split('/').slice(1).join('/') : path
  }

  function getLimit(item: ExportItem): number | null {
    const fSizes = frameSizesRef.current
    const pSizes = platformSizesRef.current
    const frameKey = item.path.split('/').pop()! + '_' + item.format
    if (fSizes[frameKey] && parseFloat(fSizes[frameKey]) > 0) {
      return parseFloat(fSizes[frameKey]) * 1024 * 1024
    }
    const platKey = `${item.format}/${item.platformName}`
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
        setPhase((prev) =>
          prev === 'exporting' || prev === 'done' ? prev : newTree.length > 0 ? 'ready' : 'empty',
        )
      }

      if (msg.type === 'rename-done') {
        cancelledRef.current = false
        setProgress({ current: 0, total: itemsRef.current.length, text: 'Начинаем экспорт...' })
        parent.postMessage({ pluginMessage: { type: 'start-export' } }, '*')
      }

      if (msg.type === 'frame-data') {
        const { index, total, path, format, pngBytes } = msg as {
          index: number
          total: number
          path: string
          format: string
          pngBytes: ArrayBuffer
        }
        const item = itemsRef.current[index]
        const limit = getLimit(item)
        setProgress({ current: index + 1, total, text: `Обработка ${index + 1}/${total}: ${path}` })
        try {
          const blob = await convertFrame(new Uint8Array(pngBytes), format, limit)
          const zPath = resolvePath(path)
          zipRef.current?.file(zPath, blob)
          exportedFilesRef.current.push(zPath)
        } catch (e) {
          console.error('Error converting', path, e)
        }
        if (!cancelledRef.current) {
          parent.postMessage({ pluginMessage: { type: 'request-frame', index: index + 1 } }, '*')
        }
      }

      if (msg.type === 'gif-data') {
        const { index, total, path, frames, width, height } = msg as {
          index: number
          total: number
          path: string
          frames: ArrayBuffer[]
          width: number
          height: number
        }
        const item = itemsRef.current[index]
        const limit = getLimit(item)
        const delay = parseFloat(gifDelayRef.current) * 1000 || 3000
        setProgress({
          current: index + 1,
          total,
          text: `Сборка GIF ${index + 1}/${total}: ${path}`,
        })
        try {
          const blob = await assembleGif(frames, width, height, delay, limit)
          const zPath = resolvePath(path)
          zipRef.current?.file(zPath, blob)
          exportedFilesRef.current.push(zPath)
        } catch (e) {
          console.error('Error assembling GIF', path, e)
        }
        if (!cancelledRef.current) {
          parent.postMessage({ pluginMessage: { type: 'request-frame', index: index + 1 } }, '*')
        }
      }

      if (msg.type === 'export-complete') {
        setProgress((p) => ({ ...p, text: 'Создание ZIP...' }))
        zipRef.current?.generateAsync({ type: 'blob' }).then((blob) => {
          setZipBlob(blob)
          setPhase('done')
          setProgress((p) => ({
            ...p,
            current: p.total,
            text: `Готово! Размер: ${(blob.size / 1024 / 1024).toFixed(2)} МБ`,
          }))
        })
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  function handleRescan() {
    setPhase('loading')
    setSearch('')
    parent.postMessage({ pluginMessage: { type: 'scan' } }, '*')
  }

  function handleExport() {
    zipRef.current = new JSZip()
    exportedFilesRef.current = []
    setZipBlob(null)
    setPhase('exporting')
    setProgress({ current: 0, total: items.length, text: 'Переименование фреймов...' })
    // Rename frames to their dimensions, then start export
    parent.postMessage({ pluginMessage: { type: 'rename-frames' } }, '*')
  }

  function handleCancel() {
    cancelledRef.current = true
    setPhase('ready')
    setProgress({ current: 0, total: 0, text: '' })
  }

  function handleDownloadPreview() {
    const html = buildPreviewHtml(exportedFilesRef.current)
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'preview.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function handleDownload() {
    if (!zipBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipBlob)
    a.download = 'export-prod.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search])

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

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 12, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}>
      {/* Header with item count and rescan */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text>
          <strong>Найдено {items.length}</strong>{' '}
          <Muted>{declension(items.length, 'файл', 'файла', 'файлов')}</Muted>
        </Text>
        <span
          onClick={handleRescan}
          style={{
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--figma-color-text-brand)',
            userSelect: 'none',
          }}
        >
          Обновить
        </span>
      </div>

      {/* Search */}
      <SearchInput value={search} onChange={setSearch} />
      <VerticalSpace space="small" />

      {/* Tree */}
      <Text>
        <strong>Лимиты по ресайзам</strong>
      </Text>
      <VerticalSpace space="small" />
      <div
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          border: '1px solid var(--figma-color-border)',
          borderRadius: 6,
          padding: '0 12px 12px 12px',
        }}
      >
        {filteredTree.length > 0 ? (
          filteredTree.map((node, i) => (
            <TreeNodeView
              key={i}
              node={node}
              formatTag=""
              frameSizes={frameSizes}
              onFrameSizeChange={(key, val) => setFrameSizes((prev) => ({ ...prev, [key]: val }))}
              defaultExpanded={!!search}
            />
          ))
        ) : (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <Muted>Ничего не найдено</Muted>
          </div>
        )}
      </div>

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
                <TagBadge format={format} />
                <VerticalSpace space="extraSmall" />
                {platforms.map((name) => (
                  <div
                    key={name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                  >
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

      {/* Path mode */}
      <VerticalSpace space="small" />
      <SegmentedControl
        value={pathMode}
        options={[
          { value: 'with-format', label: 'Формат/Канал/Площадка/Креатив' },
          { value: 'without-format', label: 'Канал/Площадка/Креатив' },
        ]}
        onChange={setPathMode}
      />
      {/* Export button */}
      {!isExporting && phase !== 'done' && (
        <Fragment>
          <VerticalSpace space="small" />
          <Divider />
          <VerticalSpace space="small" />
          <Button fullWidth onClick={handleExport}>
            Экспорт ({items.length} {declension(items.length, 'файл', 'файла', 'файлов')})
          </Button>
        </Fragment>
      )}

      {/* Progress + cancel */}
      {(isExporting || phase === 'done') && (
        <Fragment>
          <VerticalSpace space="small" />
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
            {isExporting && (
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
            )}
          </div>
          <VerticalSpace space="extraSmall" />
          <Muted>{progress.text}</Muted>
        </Fragment>
      )}

      {/* Download */}
      {phase === 'done' && zipBlob && (
        <Fragment>
          <VerticalSpace space="small" />
          <Button fullWidth onClick={handleDownload}>
            Скачать ZIP
          </Button>
          <VerticalSpace space="extraSmall" />
          <Button fullWidth secondary onClick={handleDownloadPreview}>
            Скачать превью HTML
          </Button>
          <VerticalSpace space="extraSmall" />
          <div style={{ textAlign: 'center' }}>
            <span
              onClick={handleRescan}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--figma-color-text-brand)',
                userSelect: 'none',
              }}
            >
              Экспортировать ещё
            </span>
          </div>
        </Fragment>
      )}
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
  render(
    <Fragment>
      <App />
      <ResizeHandle />
    </Fragment>,
    root!,
  )
} catch (e) {
  console.error('[export-prod] render error:', e)
  document.body.innerHTML = `<div style="color:red;padding:16px;font-size:12px">Render error: ${e}</div>`
}
