import type { TreeNode, ExportItem, SectionFormat } from '../model/types'
import { isSection, isFrame } from '../../../shared/lib/figma'
import { FORMATS } from '../../../shared/config'

// Shared export queue — written by export + place features, read by export feature
export let exportItems: ExportItem[] = []

/** Replaces the shared export queue with a new list of items. */
export function updateExportItems(items: ExportItem[]): void {
  exportItems = items
}

/**
 * Scans the current Figma page for the 4-level section hierarchy (Format → Channel → Platform → Creative)
 * and builds both the UI tree and the flat export queue.
 * GIF frames at the same Y position are grouped into one animation entry sorted left-to-right by X.
 * @returns An object with `tree` (for the UI) and `items` (for export processing).
 */
export function scanPage(): { tree: TreeNode[]; items: ExportItem[] } {
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

/**
 * Reads the current page's section hierarchy and returns it as plain serializable data
 * (Format → Channels → Platforms → Creatives), without Figma node references.
 * Used by the Place tab to populate its format/channel/platform/creative dropdowns.
 */
// Reads the current page's section tree and returns section names as plain data
// (format → channels → platforms → creatives), without Figma node references.
// Used by the Place tab to populate its format/channel/platform/creative dropdowns.
export function getSectionsHierarchy(): SectionFormat[] {
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
