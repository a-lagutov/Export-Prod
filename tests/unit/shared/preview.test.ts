import { describe, expect, it } from 'vitest'
import { buildPreviewHtml, escHtml } from '../../../src/shared/lib/preview'

describe('escHtml', () => {
  it('escapes &, <, > and "', () => {
    expect(escHtml(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })

  it('escapes & first so entities are not double-decoded', () => {
    expect(escHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('buildPreviewHtml', () => {
  it('renders every path as an <img> and groups by folders', () => {
    const html = buildPreviewHtml([
      'Ch/VK/creative-1/300x250.jpg',
      'Ch/VK/creative-1/300x600.jpg',
      'Ch/TG/creative-2/1080x1920.gif',
    ])
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('src="Ch/VK/creative-1/300x250.jpg"')
    expect(html).toContain('src="Ch/VK/creative-1/300x600.jpg"')
    expect(html).toContain('src="Ch/TG/creative-2/1080x1920.gif"')
    // Folder "Ch" is rendered once as a top-level group.
    expect(html.match(/class="group depth-0"/g)).toHaveLength(1)
  })

  it('escapes Figma-controlled names (no raw markup injection)', () => {
    const html = buildPreviewHtml(['<script>alert(1)</script>/"x"/c/1x1.png'])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toMatch(/src="[^"]*"x"/)
  })

  it('produces a valid page for an empty export', () => {
    const html = buildPreviewHtml([])
    expect(html).toContain('<h1>Export Preview</h1>')
    expect(html).not.toContain('<img')
  })
})
