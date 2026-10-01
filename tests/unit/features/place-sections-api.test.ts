/**
 * Code-thread Place tab protocol (features/place-sections/api): get-sections, place-frames,
 * align-sections — driven through the real emit/on channel against the mock `figma`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import * as config from '../../../src/shared/config'
import { MSG_NO_FRAMES_SELECTED } from '../../../src/shared/config/strings'
import {
  createMockFigma,
  flushAsync,
  frame,
  loadCodeThread,
  section,
  type MockFigmaHarness,
  type MockNode,
} from '../../support/mock-figma'

let harness: MockFigmaHarness

beforeEach(async () => {
  harness = createMockFigma()
  const placeApi = await loadCodeThread(
    harness,
    () => import('../../../src/features/place-sections/api'),
  )
  placeApi.register()
})

/**
 * Selects the given nodes on the current page.
 * @param nodes - Nodes to select.
 */
function select(...nodes: MockNode[]) {
  harness.page.selection = nodes
}

/**
 * Path of section names from the page down to the node's parent.
 * @param node - Node to inspect.
 * @returns e.g. ['JPG', 'Context', 'VK', 'card'].
 */
function sectionPath(node: MockNode): string[] {
  const names: string[] = []
  let ancestor = node.parent
  while (ancestor && ancestor.type !== 'PAGE') {
    names.unshift(ancestor.name)
    ancestor = ancestor.parent
  }
  return names
}

const TARGET = {
  formatName: 'jpg',
  channelName: 'Context',
  platformName: 'VK',
  creativeName: 'card',
}

describe('get-sections', () => {
  it('replies with sections-data and the selected frame count', () => {
    harness.build([section('JPG', [section('C', [section('P', [section('cr')])])])])
    const [loose] = harness.build([frame(10, 10)])
    select(loose)

    harness.send('get-sections')

    expect(harness.messagesNamed('sections-data')).toEqual([
      [
        {
          sections: [
            {
              name: 'JPG',
              channels: [{ name: 'C', platforms: [{ name: 'P', creatives: ['cr'] }] }],
            },
          ],
        },
      ],
    ])
    expect(harness.messagesNamed('selection-change')).toEqual([[{ count: 1 }]])
  })
})

describe('place-frames', () => {
  it('fails with a message when no frames are selected', async () => {
    harness.send('place-frames', TARGET)
    await flushAsync()
    expect(harness.messagesNamed('place-result')).toEqual([
      [{ success: false, message: MSG_NO_FRAMES_SELECTED }],
    ])
    expect(harness.page.children).toHaveLength(0)
  })

  it('creates the full hierarchy, uppercases the format and stacks frames vertically', async () => {
    const [first, second] = harness.build([
      frame(300, 250, { x: 1000, y: 2000 }),
      frame(300, 600, { x: 1400, y: 2100 }),
    ])
    select(first, second)

    harness.send('place-frames', TARGET)
    await flushAsync()

    expect(sectionPath(first)).toEqual(['JPG', 'Context', 'VK', 'card'])
    expect(sectionPath(second)).toEqual(['JPG', 'Context', 'VK', 'card'])
    // After fitting, frames sit at PLACE_PADDING inside the creative, stacked with FRAME_GAP.
    expect(first).toMatchObject({ x: config.PLACE_PADDING, y: config.PLACE_PADDING })
    expect(second.y - (first.y + first.height)).toBe(config.FRAME_GAP)
    // First-ever format section starts at the selection's absolute position and gets selected.
    const formatSection = harness.findByName('JPG')!
    expect(harness.page.selection).toEqual([formatSection])
    expect(formatSection.fills).toEqual([
      expect.objectContaining({ opacity: config.FORMAT_SECTION_OPACITY }),
    ])

    const [[result]] = harness.messagesNamed('place-result') as [
      [{ success: boolean; message: string }],
    ]
    expect(result).toEqual({
      success: true,
      message: '2 фрейма помещено в JPG / Context / VK / card',
    })
    // Both tabs are refreshed.
    expect(harness.messagesNamed('sections-data')).toHaveLength(1)
    const [[scan]] = harness.messagesNamed('scan-result') as [[{ items: unknown[] }]]
    expect(scan.items).toHaveLength(2)
  })

  it('reuses existing sections and appends below existing frames', async () => {
    const [firstFrame] = harness.build([frame(300, 250)])
    select(firstFrame)
    harness.send('place-frames', TARGET)
    await flushAsync()

    const [secondFrame] = harness.build([frame(300, 100)])
    select(secondFrame)
    harness.send('place-frames', { ...TARGET, formatName: 'JPG' })
    await flushAsync()

    expect(harness.page.children.filter((node) => node.type === 'SECTION')).toHaveLength(1)
    const creative = harness.findByName('card')!
    expect(creative.children).toEqual([firstFrame, secondFrame])
    expect(secondFrame.y - (firstFrame.y + firstFrame.height)).toBe(config.FRAME_GAP)
  })

  it('places a new format section FORMAT_SECTION_GAP to the right of existing ones', async () => {
    const [existing] = harness.build([
      section('PNG', [], { x: 100, y: 50, width: 900, height: 10 }),
    ])
    const [loose] = harness.build([frame(10, 10, { x: -5000, y: -5000 })])
    select(loose)

    harness.send('place-frames', TARGET)
    await flushAsync()

    const jpg = harness.findByName('JPG')!
    // The section is fitted afterwards, so check the pre-fit anchor via its creative's absolute pos.
    expect(jpg.absoluteBoundingBox.x).toBeGreaterThanOrEqual(existing.x + existing.width)
    expect(harness.page.selection).toEqual([loose])
  })

  it('lays out GIF slides horizontally per (name, y) group', async () => {
    const slides = harness.build([
      frame(100, 50, { name: 'slide', x: 300, y: 0 }),
      frame(100, 50, { name: 'slide', x: 0, y: 0 }),
      frame(100, 50, { name: 'other', x: 0, y: 500 }),
    ])
    select(...slides)

    harness.send('place-frames', { ...TARGET, formatName: 'gif' })
    await flushAsync()

    const [right, left, other] = slides
    expect(left.y).toBe(right.y)
    expect(right.x - (left.x + left.width)).toBe(config.GIF_SLIDE_GAP)
    expect(other.y - (left.y + left.height)).toBe(config.FRAME_GAP)
    expect(sectionPath(left)[0]).toBe('GIF')
  })
})

describe('align-sections', () => {
  it('renames every exportable node (FRAME/COMPONENT/INSTANCE) to rounded {w}x{h}', () => {
    harness.build([
      section('JPG', [
        section('C', [
          section('P', [
            section('cr', [
              frame(240.00001525878906, 400, { name: 'a' }),
              frame(100, 100, { name: 'b', type: 'COMPONENT' }),
              frame(50, 50, { name: 'c', type: 'INSTANCE' }),
              frame(10, 10, { name: 'rect', type: 'RECTANGLE' }),
            ]),
          ]),
        ]),
      ]),
    ])

    harness.send('align-sections')

    const creative = harness.findByName('cr')!
    expect(creative.children.map((child) => child.name)).toEqual([
      '240x400',
      '100x100',
      '50x50',
      'rect',
    ])
    expect(harness.messagesNamed('align-done')).toHaveLength(1)
  })

  it('sorts creatives by name (numeric-aware) left-to-right with ALIGN_GAP', () => {
    harness.build([
      section('JPG', [
        section('C', [
          section('P', [
            section('cr-10', [frame(10, 10)], { x: 0 }),
            section('cr-2', [frame(10, 10)], { x: 5000 }),
          ]),
        ]),
      ]),
    ])

    harness.send('align-sections')

    const two = harness.findByName('cr-2')!
    const ten = harness.findByName('cr-10')!
    expect(two.x).toBe(config.ALIGN_PADDING)
    expect(ten.x - (two.x + two.width)).toBe(config.ALIGN_GAP)
  })

  it('centres format sections on the viewport, top-aligned, and selects them', () => {
    harness.figma.viewport.center = { x: 10_000, y: 20_000 }
    const formats = harness.build([
      section('JPG', [section('C', [section('P', [section('cr', [frame(10, 10)])])])], {
        x: 0,
        y: 300,
      }),
      section('PNG', [section('C', [section('P', [section('cr', [frame(10, 10)])])])], {
        x: 900,
        y: 0,
      }),
      section('Notes', [], { x: 50, y: 50 }),
    ])

    harness.send('align-sections')

    const [jpg, png, notes] = formats
    expect(jpg.y).toBe(png.y)
    expect(png.x - (jpg.x + jpg.width)).toBe(config.ALIGN_FORMAT_GAP)
    const centreX = (jpg.x + png.x + png.width) / 2
    const centreY = jpg.y + Math.max(jpg.height, png.height) / 2
    expect(centreX).toBeCloseTo(10_000)
    expect(centreY).toBeCloseTo(20_000)
    expect(harness.page.selection).toEqual([jpg, png])
    expect(notes).toMatchObject({ x: 50, y: 50 })
  })

  it('does nothing but still replies align-done on a page without format sections', () => {
    harness.send('align-sections')
    expect(harness.messagesNamed('align-done')).toHaveLength(1)
    expect(harness.page.selection).toEqual([])
  })
})
