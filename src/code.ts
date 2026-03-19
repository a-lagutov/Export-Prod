// Export Prod — Figma plugin main thread
import type { TreeNode, ExportItem, SectionFormat } from './types'

const FORMATS = ['jpg', 'png', 'webp', 'gif'] as const

function isSection(node: SceneNode): node is SectionNode {
  return node.type === 'SECTION'
}

function isFrame(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME'
}

function scanPage(): { tree: TreeNode[]; items: ExportItem[] } {
  const tree: TreeNode[] = []
  const items: ExportItem[] = []

  for (const topChild of figma.currentPage.children) {
    if (!isSection(topChild)) continue
    const formatName = topChild.name.trim().toUpperCase()
    const format = FORMATS.find((f) => f === formatName.toLowerCase())
    if (!format) continue

    const formatTree: TreeNode = { name: topChild.name, type: 'format', children: [] }

    for (const channelNode of topChild.children) {
      if (!isSection(channelNode)) continue
      const channelTree: TreeNode = { name: channelNode.name, type: 'channel', children: [] }

      for (const platformNode of channelNode.children) {
        if (!isSection(platformNode)) continue
        const platformTree: TreeNode = { name: platformNode.name, type: 'platform', children: [] }

        for (const creativeNode of platformNode.children) {
          if (!isSection(creativeNode)) continue
          const creativeTree: TreeNode = { name: creativeNode.name, type: 'creative', children: [] }

          const frames = creativeNode.children.filter(isFrame)

          if (format === 'gif') {
            // Group frames by name + y position
            const groups = new Map<string, FrameNode[]>()
            for (const frame of frames) {
              const key = `${frame.name}_y${Math.round(frame.y)}`
              if (!groups.has(key)) groups.set(key, [])
              groups.get(key)!.push(frame)
            }

            const sizeCount = new Map<string, number>()
            for (const [, groupFrames] of groups) {
              // Sort by x position (left to right)
              groupFrames.sort((a, b) => a.x - b.x)
              const w = groupFrames[0].width
              const h = groupFrames[0].height
              const sizeKey = `${w}x${h}`
              const count = (sizeCount.get(sizeKey) || 0) + 1
              sizeCount.set(sizeKey, count)
              const suffix = count > 1 ? `_${count}` : ''
              const fileName = `${sizeKey}${suffix}.gif`
              const path = `${topChild.name}/${channelNode.name}/${platformNode.name}/${creativeNode.name}/${fileName}`

              items.push({
                path,
                format: 'gif',
                nodeIds: groupFrames.map((f) => f.id),
                platformName: platformNode.name,
                width: w,
                height: h,
              })

              creativeTree.children!.push({
                name: fileName,
                type: 'frame',
                size: `${w}x${h} (${groupFrames.length} frames)`,
              })
            }
          } else {
            const sizeCount = new Map<string, number>()
            for (const frame of frames) {
              const sizeKey = `${frame.width}x${frame.height}`
              const count = (sizeCount.get(sizeKey) || 0) + 1
              sizeCount.set(sizeKey, count)
              const suffix = count > 1 ? `_${count}` : ''
              const ext = format
              const fileName = `${sizeKey}${suffix}.${ext}`
              const path = `${topChild.name}/${channelNode.name}/${platformNode.name}/${creativeNode.name}/${fileName}`

              items.push({
                path,
                format,
                nodeIds: [frame.id],
                platformName: platformNode.name,
                width: frame.width,
                height: frame.height,
              })

              creativeTree.children!.push({
                name: fileName,
                type: 'frame',
                size: sizeKey,
              })
            }
          }

          if (creativeTree.children!.length > 0) {
            platformTree.children!.push(creativeTree)
          }
        }
        if (platformTree.children!.length > 0) {
          channelTree.children!.push(platformTree)
        }
      }
      if (channelTree.children!.length > 0) {
        formatTree.children!.push(channelTree)
      }
    }
    if (formatTree.children!.length > 0) {
      tree.push(formatTree)
    }
  }

  return { tree, items }
}

// Resize a section so its bounding box encompasses all its children + padding.
// Uses local coordinates (always current) instead of absoluteBoundingBox (can be stale).
// Shifts the section origin so content has `padding` space on all sides, compensating
// children's local positions to keep their absolute positions unchanged.
function fitSectionToChildren(section: SectionNode, padding = 40): void {
  const children = section.children as SceneNode[]
  if (children.length === 0) return

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const child of children) {
    minX = Math.min(minX, child.x)
    minY = Math.min(minY, child.y)
    maxX = Math.max(maxX, child.x + child.width)
    maxY = Math.max(maxY, child.y + child.height)
  }
  if (!isFinite(minX)) return

  // How much the section origin needs to shift so content starts at `padding`
  const shiftX = minX - padding
  const shiftY = minY - padding

  // Move the section in parent coords
  section.x += shiftX
  section.y += shiftY

  // Compensate children so their absolute positions don't change
  for (const child of children) {
    child.x -= shiftX
    child.y -= shiftY
  }

  const newW = Math.max(1, maxX - minX + 2 * padding)
  const newH = Math.max(1, maxY - minY + 2 * padding)
  try {
    section.resizeWithoutConstraints(newW, newH)
  } catch {
    ;(section as unknown as { resize(w: number, h: number): void }).resize(newW, newH)
  }
}

// Resize a section to contain its children with padding, WITHOUT moving the section.
// Unlike fitSectionToChildren, this does not shift the section origin or compensate children.
// Use this when children are already positioned correctly and you only need to resize the parent.
function resizeSectionOnly(section: SectionNode, padding: number): void {
  const children = section.children as SceneNode[]
  if (children.length === 0) return
  let maxX = 0,
    maxY = 0
  for (const child of children) {
    maxX = Math.max(maxX, child.x + child.width)
    maxY = Math.max(maxY, child.y + child.height)
  }
  const newW = Math.max(1, maxX + padding)
  const newH = Math.max(1, maxY + padding)
  try {
    section.resizeWithoutConstraints(newW, newH)
  } catch {
    ;(section as unknown as { resize(w: number, h: number): void }).resize(newW, newH)
  }
}

function setSectionFill(section: SectionNode, opacity: number): void {
  section.fills = [{ type: 'SOLID', color: { r: 68 / 255, g: 68 / 255, b: 68 / 255 }, opacity }]
}

function getAllSections(): SectionFormat[] {
  const formats: SectionFormat[] = []

  for (const topChild of figma.currentPage.children) {
    if (!isSection(topChild)) continue
    const formatLower = topChild.name.trim().toLowerCase()
    if (!FORMATS.find((f) => f === formatLower)) continue

    const channels = []
    for (const ch of topChild.children) {
      if (!isSection(ch)) continue
      const platforms = []
      for (const pl of ch.children) {
        if (!isSection(pl)) continue
        const creatives: string[] = []
        for (const cr of pl.children) {
          if (!isSection(cr)) continue
          creatives.push(cr.name)
        }
        platforms.push({ name: pl.name, creatives })
      }
      channels.push({ name: ch.name, platforms })
    }
    formats.push({ name: topChild.name.trim(), channels })
  }

  return formats
}

let exportItems: ExportItem[] = []
let isExporting = false

figma.showUI(__html__, { width: 400, height: 560, themeColors: true })

// Auto-scan on plugin open
{
  const result = scanPage()
  exportItems = result.items
  figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items })
}

// Re-scan when page changes
figma.on('currentpagechange', () => {
  const result = scanPage()
  exportItems = result.items
  figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items })
  figma.ui.postMessage({ type: 'sections-data', sections: getAllSections() })
  const frames = figma.currentPage.selection.filter(isFrame)
  figma.ui.postMessage({ type: 'selection-change', count: frames.length })
})

figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
  if (msg.type === 'scan') {
    const result = scanPage()
    exportItems = result.items
    figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items })
  }

  if (msg.type === 'resize') {
    const h = msg.height as number
    figma.ui.resize(400, Math.max(200, h))
  }

  if (msg.type === 'get-sections') {
    figma.ui.postMessage({ type: 'sections-data', sections: getAllSections() })
    const frames = figma.currentPage.selection.filter(isFrame)
    figma.ui.postMessage({ type: 'selection-change', count: frames.length })
  }

  if (msg.type === 'place-frames') {
    const formatName = msg.formatName as string
    const channelName = msg.channelName as string
    const platformName = msg.platformName as string
    const creativeName = msg.creativeName as string

    const selectedFrames = figma.currentPage.selection.filter(isFrame)

    if (selectedFrames.length === 0) {
      figma.ui.postMessage({
        type: 'place-result',
        success: false,
        message: 'Нет выбранных фреймов',
      })
      return
    }

    const page = figma.currentPage
    const normalizedFormat = formatName.toUpperCase()
    const PLACE_PADDING = 250
    const FRAME_GAP = 250
    const GIF_SLIDE_GAP = 50

    // Collect existing format sections before creating a new one (used for positioning)
    const existingFormatSections = page.children.filter(
      (n): n is SectionNode =>
        isSection(n) && FORMATS.includes(n.name.trim().toLowerCase() as (typeof FORMATS)[number]),
    )

    // Find or create format section
    let formatSection = page.children.find(
      (n): n is SectionNode => isSection(n) && n.name.toLowerCase() === formatName.toLowerCase(),
    )
    const isNewFormatSection = !formatSection
    if (!formatSection) {
      formatSection = figma.createSection()
      formatSection.name = normalizedFormat
      if (existingFormatSections.length > 0) {
        // Place 5000px to the right of the rightmost format section
        const rightmostX = Math.max(...existingFormatSections.map((s) => s.x + s.width))
        formatSection.x = rightmostX + 5000
        formatSection.y = Math.min(...existingFormatSections.map((s) => s.y))
      } else {
        // No format sections yet — place at the selected frames' position
        const absX = Math.min(...selectedFrames.map((f) => f.absoluteBoundingBox?.x ?? f.x))
        const absY = Math.min(...selectedFrames.map((f) => f.absoluteBoundingBox?.y ?? f.y))
        formatSection.x = absX
        formatSection.y = absY
      }
    }
    setSectionFill(formatSection, 0.2)

    // Find or create channel section
    let channelSection = formatSection.children.find(
      (n): n is SectionNode => isSection(n) && n.name === channelName,
    )
    if (!channelSection) {
      channelSection = figma.createSection()
      channelSection.name = channelName
      formatSection.appendChild(channelSection)
      const chSiblings = formatSection.children.filter(
        (n): n is SectionNode => isSection(n) && n !== channelSection,
      )
      if (chSiblings.length > 0) {
        channelSection.x = Math.min(...chSiblings.map((s) => s.x))
        channelSection.y = Math.max(...chSiblings.map((s) => s.y + s.height)) + FRAME_GAP
      } else {
        channelSection.x = PLACE_PADDING
        channelSection.y = PLACE_PADDING
      }
    }
    setSectionFill(channelSection, 0.4)

    // Find or create platform section
    let platformSection = channelSection.children.find(
      (n): n is SectionNode => isSection(n) && n.name === platformName,
    )
    if (!platformSection) {
      platformSection = figma.createSection()
      platformSection.name = platformName
      channelSection.appendChild(platformSection)
      const plSiblings = channelSection.children.filter(
        (n): n is SectionNode => isSection(n) && n !== platformSection,
      )
      if (plSiblings.length > 0) {
        platformSection.x = Math.min(...plSiblings.map((s) => s.x))
        platformSection.y = Math.max(...plSiblings.map((s) => s.y + s.height)) + FRAME_GAP
      } else {
        platformSection.x = PLACE_PADDING
        platformSection.y = PLACE_PADDING
      }
    }
    setSectionFill(platformSection, 0.6)

    // Find or create creative section
    let creativeSection = platformSection.children.find(
      (n): n is SectionNode => isSection(n) && n.name === creativeName,
    )
    if (!creativeSection) {
      creativeSection = figma.createSection()
      creativeSection.name = creativeName
      platformSection.appendChild(creativeSection)
      const crSiblings = platformSection.children.filter(
        (n): n is SectionNode => isSection(n) && n !== creativeSection,
      )
      if (crSiblings.length > 0) {
        creativeSection.x = Math.max(...crSiblings.map((s) => s.x + s.width)) + FRAME_GAP
        creativeSection.y = Math.min(...crSiblings.map((s) => s.y))
      } else {
        creativeSection.x = PLACE_PADDING
        creativeSection.y = PLACE_PADDING
      }
    }
    setSectionFill(creativeSection, 0.8)

    // Find bottom of existing frames in creative section (local coords)
    const existingFrames = creativeSection.children.filter(isFrame) as FrameNode[]
    let nextY =
      existingFrames.length > 0
        ? Math.max(...existingFrames.map((f) => f.y + f.height)) + FRAME_GAP
        : PLACE_PADDING

    // Place frames: vertically stacked; for GIF — group by name+y, slides horizontal
    if (formatName.toLowerCase() === 'gif') {
      const groups = new Map<string, FrameNode[]>()
      for (const frame of selectedFrames) {
        const key = `${frame.name}_y${Math.round(frame.y)}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(frame)
      }
      for (const [, groupFrames] of groups) {
        groupFrames.sort((a, b) => a.x - b.x)
        let groupNextX = PLACE_PADDING
        for (const frame of groupFrames) {
          creativeSection.appendChild(frame)
          frame.x = groupNextX
          frame.y = nextY
          groupNextX += frame.width + GIF_SLIDE_GAP
        }
        nextY += Math.max(...groupFrames.map((f) => f.height)) + FRAME_GAP
      }
    } else {
      for (const frame of selectedFrames) {
        creativeSection.appendChild(frame)
        frame.x = PLACE_PADDING
        frame.y = nextY
        nextY += frame.height + FRAME_GAP
      }
    }

    // Resize sections bottom-up with 250px padding
    fitSectionToChildren(creativeSection, PLACE_PADDING)
    fitSectionToChildren(platformSection, PLACE_PADDING)
    fitSectionToChildren(channelSection, PLACE_PADDING)
    fitSectionToChildren(formatSection, PLACE_PADDING)

    // Scroll viewport to show the result; select format section if it's the first one ever
    if (isNewFormatSection && existingFormatSections.length === 0) {
      figma.currentPage.selection = [formatSection]
      figma.viewport.scrollAndZoomIntoView([formatSection])
    } else {
      figma.viewport.scrollAndZoomIntoView([creativeSection])
    }

    const count = selectedFrames.length
    figma.ui.postMessage({
      type: 'place-result',
      success: true,
      message: `${count} ${count === 1 ? 'фрейм помещён' : count < 5 ? 'фрейма помещено' : 'фреймов помещено'} в ${normalizedFormat} / ${channelName} / ${platformName} / ${creativeName}`,
    })

    // Update both tabs
    figma.ui.postMessage({ type: 'sections-data', sections: getAllSections() })
    const result = scanPage()
    exportItems = result.items
    figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items })
  }

  if (msg.type === 'align-sections') {
    const ALIGN_PADDING = 250
    const ALIGN_GAP = 250
    const FORMAT_GAP = 5000

    const formatSections: SectionNode[] = []

    for (const topChild of figma.currentPage.children) {
      if (!isSection(topChild)) continue
      if (!FORMATS.find((f) => f === topChild.name.trim().toLowerCase())) continue
      formatSections.push(topChild)

      for (const ch of topChild.children) {
        if (!isSection(ch)) continue

        for (const pl of ch.children) {
          if (!isSection(pl)) continue

          // Step 1: fit each creative to its frames (normalises frame positions inside)
          for (const cr of pl.children) {
            if (!isSection(cr)) continue
            fitSectionToChildren(cr, ALIGN_PADDING)
            setSectionFill(cr, 0.8)
          }

          // Step 2: reposition creatives horizontally sorted by name
          const creatives = [...pl.children].filter(isSection) as SectionNode[]
          creatives.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          let nextX = ALIGN_PADDING
          for (const cr of creatives) {
            cr.x = nextX
            cr.y = ALIGN_PADDING
            nextX += cr.width + ALIGN_GAP
          }

          // Step 3: resize platform to contain repositioned creatives
          resizeSectionOnly(pl, ALIGN_PADDING)
          setSectionFill(pl, 0.6)
        }

        // Step 4: reposition platforms vertically within channel
        let nextY = ALIGN_PADDING
        for (const pl of ch.children) {
          if (!isSection(pl)) continue
          pl.x = ALIGN_PADDING
          pl.y = nextY
          nextY += pl.height + ALIGN_GAP
        }

        // Step 5: resize channel
        resizeSectionOnly(ch, ALIGN_PADDING)
        setSectionFill(ch, 0.4)
      }

      // Step 6: reposition channels vertically within format
      let nextY = ALIGN_PADDING
      for (const ch of topChild.children) {
        if (!isSection(ch)) continue
        ch.x = ALIGN_PADDING
        ch.y = nextY
        nextY += ch.height + ALIGN_GAP
      }

      // Step 7: resize format section
      resizeSectionOnly(topChild, ALIGN_PADDING)
      setSectionFill(topChild, 0.2)
    }

    // Step 8: reposition format sections horizontally on the page with FORMAT_GAP, aligned to top edge
    formatSections.sort((a, b) => a.x - b.x)
    const topY = Math.min(...formatSections.map((s) => s.y))
    let nextX = formatSections[0]?.x ?? 0
    for (const fmt of formatSections) {
      fmt.x = nextX
      fmt.y = topY
      nextX += fmt.width + FORMAT_GAP
    }

    if (formatSections.length > 0) {
      figma.currentPage.selection = formatSections
      figma.viewport.scrollAndZoomIntoView(formatSections)
    }

    figma.ui.postMessage({ type: 'align-done' })
  }

  if (msg.type === 'rename-frames') {
    isExporting = true
    const filterFormat = (msg.filterFormat as string | undefined)?.toLowerCase()
    const filterPlatform = msg.filterPlatform as string | undefined
    // Rename all frames to their dimensions (e.g. "1080x1920")
    for (const item of exportItems) {
      for (const nodeId of item.nodeIds) {
        const node = await figma.getNodeByIdAsync(nodeId)
        if (node && node.type === 'FRAME') {
          const frameName = `${(node as FrameNode).width}x${(node as FrameNode).height}`
          node.name = frameName
        }
      }
    }
    // Re-scan to update tree with new names
    const result = scanPage()
    exportItems = result.items
    if (filterFormat || filterPlatform) {
      exportItems = exportItems.filter(
        (item) =>
          (!filterFormat || item.format === filterFormat) &&
          (!filterPlatform || item.platformName === filterPlatform),
      )
    }
    figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items })
    figma.ui.postMessage({ type: 'rename-done' })
  }

  if (msg.type === 'start-export') {
    // Send first frame
    if (exportItems.length > 0) {
      await sendFrame(0)
    } else {
      figma.ui.postMessage({ type: 'export-complete' })
    }
  }

  if (msg.type === 'request-frame') {
    const index = msg.index as number
    if (index < exportItems.length) {
      await sendFrame(index)
    } else {
      isExporting = false
      figma.ui.postMessage({ type: 'export-complete' })
    }
  }
}

// Debounced auto-rescan on document changes (section added/removed/renamed).
// documentchange requires loadAllPagesAsync to be called first.
function isOnCurrentPage(node: BaseNode): boolean {
  let n: BaseNode | null = node
  while (n) {
    if (n.type === 'PAGE') return n.id === figma.currentPage.id
    n = n.parent
  }
  // Detached node (e.g. just deleted) — conservatively treat as current page
  return true
}

let rescanTimer: ReturnType<typeof setTimeout> | null = null
;(async () => {
  await figma.loadAllPagesAsync()
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
      exportItems = result.items
      figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items })
      figma.ui.postMessage({ type: 'sections-data', sections: getAllSections() })
    }, 500)
  })
})()

figma.on('selectionchange', () => {
  const frames = figma.currentPage.selection.filter(isFrame)
  figma.ui.postMessage({ type: 'selection-change', count: frames.length })
})

async function sendFrame(index: number) {
  const item = exportItems[index]
  const total = exportItems.length
  const exportSettings: ExportSettings = { format: 'PNG', constraint: { type: 'SCALE', value: 1 } }

  if (item.format === 'gif') {
    // Export all gif frames
    const framesData: Uint8Array[] = []
    for (const nodeId of item.nodeIds) {
      const node = (await figma.getNodeByIdAsync(nodeId)) as FrameNode
      const bytes = await node.exportAsync(exportSettings)
      framesData.push(bytes)
    }
    figma.ui.postMessage({
      type: 'gif-data',
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
    figma.ui.postMessage({
      type: 'frame-data',
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
