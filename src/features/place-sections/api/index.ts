import { emit, on } from '@create-figma-plugin/utilities'
import { scanPage, getSectionsHierarchy, updateExportItems } from '../../../entities/frame/api'
import { FORMATS } from '../../../shared/config'
import { placeResultMessage, MSG_NO_FRAMES_SELECTED } from '../../../shared/config/strings'
import {
  isSection,
  isFrame,
  isExportableNode,
  fitSectionToChildren,
  resizeSectionOnly,
  setSectionFill,
} from '../../../shared/lib/figma'
import * as config from '../../../shared/config'

/**
 * Registers all code-thread message handlers for the place-sections feature:
 * `get-sections`, `place-frames`, and `align-sections`.
 */
export function register(): void {
  on('get-sections', () => {
    emit('sections-data', { sections: getSectionsHierarchy() })
    const frames = figma.currentPage.selection.filter(isFrame)
    emit('selection-change', { count: frames.length })
  })

  on(
    'place-frames',
    async ({
      formatName,
      channelName,
      platformName,
      creativeName,
    }: {
      formatName: string
      channelName: string
      platformName: string
      creativeName: string
    }) => {
      const selectedFrames = figma.currentPage.selection.filter(isFrame)

      if (selectedFrames.length === 0) {
        emit('place-result', { success: false, message: MSG_NO_FRAMES_SELECTED })
        return
      }

      const page = figma.currentPage
      const normalizedFormat = formatName.toUpperCase()

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
          formatSection.x = rightmostX + config.FORMAT_SECTION_GAP
          formatSection.y = Math.min(...existingFormatSections.map((s) => s.y))
        } else {
          // No format sections yet — place at the selected frames' position
          const absX = Math.min(...selectedFrames.map((f) => f.absoluteBoundingBox?.x ?? f.x))
          const absY = Math.min(...selectedFrames.map((f) => f.absoluteBoundingBox?.y ?? f.y))
          formatSection.x = absX
          formatSection.y = absY
        }
      }
      setSectionFill(formatSection, config.FORMAT_SECTION_OPACITY)

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
          channelSection.y = Math.max(...chSiblings.map((s) => s.y + s.height)) + config.FRAME_GAP
        } else {
          channelSection.x = config.PLACE_PADDING
          channelSection.y = config.PLACE_PADDING
        }
      }
      setSectionFill(channelSection, config.CHANNEL_SECTION_OPACITY)

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
          platformSection.y = Math.max(...plSiblings.map((s) => s.y + s.height)) + config.FRAME_GAP
        } else {
          platformSection.x = config.PLACE_PADDING
          platformSection.y = config.PLACE_PADDING
        }
      }
      setSectionFill(platformSection, config.PLATFORM_SECTION_OPACITY)

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
          creativeSection.x = Math.max(...crSiblings.map((s) => s.x + s.width)) + config.FRAME_GAP
          creativeSection.y = Math.min(...crSiblings.map((s) => s.y))
        } else {
          creativeSection.x = config.PLACE_PADDING
          creativeSection.y = config.PLACE_PADDING
        }
      }
      setSectionFill(creativeSection, config.CREATIVE_SECTION_OPACITY)

      // Find bottom of existing frames in creative section (local coords)
      const existingFrames = creativeSection.children.filter(isFrame) as FrameNode[]
      let nextY =
        existingFrames.length > 0
          ? Math.max(...existingFrames.map((f) => f.y + f.height)) + config.FRAME_GAP
          : config.PLACE_PADDING

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
          let groupNextX = config.PLACE_PADDING
          for (const frame of groupFrames) {
            creativeSection.appendChild(frame)
            frame.x = groupNextX
            frame.y = nextY
            groupNextX += frame.width + config.GIF_SLIDE_GAP
          }
          nextY += Math.max(...groupFrames.map((f) => f.height)) + config.FRAME_GAP
        }
      } else {
        for (const frame of selectedFrames) {
          creativeSection.appendChild(frame)
          frame.x = config.PLACE_PADDING
          frame.y = nextY
          nextY += frame.height + config.FRAME_GAP
        }
      }

      // Resize sections bottom-up with 250px padding
      fitSectionToChildren(creativeSection, config.PLACE_PADDING)
      fitSectionToChildren(platformSection, config.PLACE_PADDING)
      fitSectionToChildren(channelSection, config.PLACE_PADDING)
      fitSectionToChildren(formatSection, config.PLACE_PADDING)

      // Scroll viewport to show the result; select format section if it's the first one ever
      if (isNewFormatSection && existingFormatSections.length === 0) {
        figma.currentPage.selection = [formatSection]
        figma.viewport.scrollAndZoomIntoView([formatSection])
      } else {
        figma.viewport.scrollAndZoomIntoView([creativeSection])
      }

      const count = selectedFrames.length
      emit('place-result', {
        success: true,
        message: placeResultMessage(
          count,
          normalizedFormat,
          channelName,
          platformName,
          creativeName,
        ),
      })

      // Update both tabs
      emit('sections-data', { sections: getSectionsHierarchy() })
      const result = scanPage()
      updateExportItems(result.items)
      emit('scan-result', { tree: result.tree, items: result.items })
    },
  )

  on('align-sections', () => {
    // Capture viewport center before any layout changes so we can reposition sections there
    const viewportCenter = figma.viewport.center
    const formatSections: SectionNode[] = []

    for (const topChild of figma.currentPage.children) {
      if (!isSection(topChild)) continue
      if (!FORMATS.find((f) => f === topChild.name.trim().toLowerCase())) continue
      formatSections.push(topChild)

      for (const ch of topChild.children) {
        if (!isSection(ch)) continue

        for (const pl of ch.children) {
          if (!isSection(pl)) continue

          // Step 1: rename exportable nodes to {width}x{height}, then fit each creative
          for (const cr of pl.children) {
            if (!isSection(cr)) continue
            for (const child of cr.children) {
              if (isExportableNode(child)) {
                child.name = `${child.width}x${child.height}`
              }
            }
            fitSectionToChildren(cr, config.ALIGN_PADDING)
            setSectionFill(cr, 0.8)
          }

          // Step 2: reposition creatives horizontally sorted by name
          const creatives = [...pl.children].filter(isSection) as SectionNode[]
          creatives.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          let nextX = config.ALIGN_PADDING
          for (const cr of creatives) {
            cr.x = nextX
            cr.y = config.ALIGN_PADDING
            nextX += cr.width + config.ALIGN_GAP
          }

          // Step 3: resize platform to contain repositioned creatives
          resizeSectionOnly(pl, config.ALIGN_PADDING)
          setSectionFill(pl, 0.6)
        }

        // Step 4: reposition platforms vertically within channel
        let nextY = config.ALIGN_PADDING
        for (const pl of ch.children) {
          if (!isSection(pl)) continue
          pl.x = config.ALIGN_PADDING
          pl.y = nextY
          nextY += pl.height + config.ALIGN_GAP
        }

        // Step 5: resize channel
        resizeSectionOnly(ch, config.ALIGN_PADDING)
        setSectionFill(ch, 0.4)
      }

      // Step 6: reposition channels vertically within format
      let nextY = config.ALIGN_PADDING
      for (const ch of topChild.children) {
        if (!isSection(ch)) continue
        ch.x = config.ALIGN_PADDING
        ch.y = nextY
        nextY += ch.height + config.ALIGN_GAP
      }

      // Step 7: resize format section
      resizeSectionOnly(topChild, config.ALIGN_PADDING)
      setSectionFill(topChild, 0.2)
    }

    // Step 8: reposition format sections horizontally on the page with FORMAT_GAP, aligned to top edge
    formatSections.sort((a, b) => a.x - b.x)
    const topY = Math.min(...formatSections.map((s) => s.y))
    let nextX = formatSections[0]?.x ?? 0
    for (const fmt of formatSections) {
      fmt.x = nextX
      fmt.y = topY
      nextX += fmt.width + config.ALIGN_FORMAT_GAP
    }

    if (formatSections.length > 0) {
      // Shift all format sections so their collective bounding box is centered on the viewport
      const minX = Math.min(...formatSections.map((s) => s.x))
      const maxX = Math.max(...formatSections.map((s) => s.x + s.width))
      const minY = Math.min(...formatSections.map((s) => s.y))
      const maxY = Math.max(...formatSections.map((s) => s.y + s.height))
      const deltaX = viewportCenter.x - (minX + maxX) / 2
      const deltaY = viewportCenter.y - (minY + maxY) / 2
      for (const fmt of formatSections) {
        fmt.x += deltaX
        fmt.y += deltaY
      }

      figma.currentPage.selection = formatSections
    }

    emit('align-done')
  })
}
