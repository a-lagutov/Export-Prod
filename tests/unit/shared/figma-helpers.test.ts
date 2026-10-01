import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMockFigma,
  frame,
  loadCodeThread,
  section,
  type MockFigmaHarness,
  type MockNode,
} from '../../support/mock-figma'

type FigmaHelpers = typeof import('../../../src/shared/lib/figma')

let harness: MockFigmaHarness
let helpers: FigmaHelpers

/**
 * Casts a mock node to the Figma type the helpers expect.
 * @param node - Mock node.
 * @returns The same node typed as a SectionNode.
 */
const asSection = (node: MockNode) => node as unknown as SectionNode

beforeEach(async () => {
  harness = createMockFigma()
  helpers = await loadCodeThread(harness, () => import('../../../src/shared/lib/figma'))
})

describe('type guards', () => {
  it('classify node types', () => {
    const [sectionNode, frameNode, component, instance, rectangle] = harness.build([
      section('s'),
      frame(1, 1),
      frame(1, 1, { type: 'COMPONENT' }),
      frame(1, 1, { type: 'INSTANCE' }),
      frame(1, 1, { type: 'RECTANGLE' }),
    ]) as unknown as SceneNode[]

    expect(helpers.isSection(sectionNode)).toBe(true)
    expect(helpers.isSection(frameNode)).toBe(false)
    expect(helpers.isFrame(frameNode)).toBe(true)
    expect(helpers.isFrame(component)).toBe(false)
    expect([frameNode, component, instance, rectangle].map(helpers.isExportableNode)).toEqual([
      true,
      true,
      true,
      false,
    ])
  })
})

describe('fitSectionToChildren', () => {
  it('wraps children with padding and keeps their absolute positions', () => {
    const [sectionNode] = harness.build([
      section('s', [frame(100, 50, { x: 500, y: 300 }), frame(20, 20, { x: 700, y: 400 })], {
        x: 1000,
        y: 2000,
        width: 10,
        height: 10,
      }),
    ])
    const absoluteBefore = sectionNode.children.map((child) => child.absoluteBoundingBox)

    helpers.fitSectionToChildren(asSection(sectionNode), 40)

    expect(sectionNode.children.map((child) => child.absoluteBoundingBox)).toEqual(absoluteBefore)
    // Content bbox: x 500..720, y 300..420 → origin shifts by (460, 260), size 300x200.
    expect(sectionNode).toMatchObject({ x: 1460, y: 2260, width: 300, height: 200 })
    expect(sectionNode.children[0]).toMatchObject({ x: 40, y: 40 })
  })

  it('uses SECTION_FIT_PADDING by default and is a no-op for empty sections', async () => {
    const config = await import('../../../src/shared/config')
    const [withChild, empty] = harness.build([
      section('a', [frame(10, 10)]),
      section('b', [], { x: 5, y: 5, width: 7, height: 7 }),
    ])
    helpers.fitSectionToChildren(asSection(withChild))
    helpers.fitSectionToChildren(asSection(empty))
    expect(withChild.width).toBe(10 + 2 * config.SECTION_FIT_PADDING)
    expect(empty).toMatchObject({ x: 5, y: 5, width: 7, height: 7 })
  })
})

describe('resizeSectionOnly', () => {
  it('grows to the far edge of children plus padding without moving anything', () => {
    const [sectionNode] = harness.build([
      section('s', [frame(100, 50, { x: 250, y: 250 })], { x: 9, y: 9 }),
    ])
    helpers.resizeSectionOnly(asSection(sectionNode), 250)
    expect(sectionNode).toMatchObject({ x: 9, y: 9, width: 600, height: 550 })
    expect(sectionNode.children[0]).toMatchObject({ x: 250, y: 250 })
  })
})

describe('setSectionFill', () => {
  it('applies a single dark solid fill with the given opacity', () => {
    const [sectionNode] = harness.build([section('s')])
    helpers.setSectionFill(asSection(sectionNode), 0.4)
    expect(sectionNode.fills).toEqual([
      { type: 'SOLID', color: { r: 68 / 255, g: 68 / 255, b: 68 / 255 }, opacity: 0.4 },
    ])
  })
})
