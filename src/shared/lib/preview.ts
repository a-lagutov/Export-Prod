/** Escapes special HTML characters in a string to prevent XSS when inserting into HTML. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Builds a self-contained HTML preview page from a list of exported file paths.
 * Groups paths into a nested folder tree and renders each leaf as an image thumbnail.
 * All file names and paths are HTML-escaped to prevent XSS.
 * @param paths - Relative file paths (e.g. `["JPG/Channel/Platform/Creative/800x600.jpg"]`).
 * @returns A complete HTML document string ready for download.
 */
export function buildPreviewHtml(paths: string[]): string {
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
