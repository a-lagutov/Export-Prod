import * as config from '../config'

/** Returns true if the given scene node is a Figma section. */
export function isSection(node: SceneNode): node is SectionNode {
  return node.type === 'SECTION'
}

/** Returns true if the given scene node is a Figma frame. */
export function isFrame(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME'
}

/**
 * Resizes a section so its bounding box encompasses all its children plus padding.
 * Uses local coordinates (always current) instead of absoluteBoundingBox (can be stale).
 * Shifts the section origin so content has `padding` space on all sides, compensating
 * children's local positions to keep their absolute positions unchanged.
 */
// Resize a section so its bounding box encompasses all its children + padding.
// Uses local coordinates (always current) instead of absoluteBoundingBox (can be stale).
// Shifts the section origin so content has `padding` space on all sides, compensating
// children's local positions to keep their absolute positions unchanged.
export function fitSectionToChildren(
  section: SectionNode,
  padding = config.SECTION_FIT_PADDING,
): void {
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

/**
 * Resizes a section to contain its children with padding, without moving the section origin.
 * Unlike {@link fitSectionToChildren}, does not shift the section or compensate child positions.
 * Use when children are already positioned correctly and only the parent size needs updating.
 */
// Resize a section to contain its children with padding, WITHOUT moving the section.
// Unlike fitSectionToChildren, this does not shift the section origin or compensate children.
// Use this when children are already positioned correctly and you only need to resize the parent.
export function resizeSectionOnly(section: SectionNode, padding: number): void {
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
    ;(section as unknown as { resize(w: number, g: number): void }).resize(newW, newH)
  }
}

/** Sets a solid dark fill on a section at the given opacity to visually distinguish hierarchy levels. */
export function setSectionFill(section: SectionNode, opacity: number): void {
  section.fills = [{ type: 'SOLID', color: { r: 68 / 255, g: 68 / 255, b: 68 / 255 }, opacity }]
}
