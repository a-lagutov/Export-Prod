import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMockFigma,
  frame,
  loadCodeThread,
  section,
  type MockFigmaHarness,
} from '../../support/mock-figma'

type FrameApi = typeof import('../../../src/entities/frame/api')

let harness: MockFigmaHarness
let frameApi: FrameApi

beforeEach(async () => {
  harness = createMockFigma()
  frameApi = await loadCodeThread(harness, () => import('../../../src/entities/frame/api'))
})

describe('scanPage', () => {
  it('builds the 4-level tree and export items for raster formats', () => {
    harness.build([
      section('JPG', [
        section('Context', [
          section('VK', [section('1234-card', [frame(300, 250), frame(300, 600)])]),
        ]),
      ]),
    ])

    const { tree, items } = frameApi.scanPage()

    expect(tree).toEqual([
      {
        name: 'JPG',
        type: 'format',
        children: [
          {
            name: 'Context',
            type: 'channel',
            children: [
              {
                name: 'VK',
                type: 'platform',
                children: [
                  {
                    name: '1234-card',
                    type: 'creative',
                    children: [
                      { name: '300x250.jpg', type: 'frame', size: '300x250' },
                      { name: '300x600.jpg', type: 'frame', size: '300x600' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    expect(items.map((item) => item.path)).toEqual([
      'JPG/Context/VK/1234-card/300x250.jpg',
      'JPG/Context/VK/1234-card/300x600.jpg',
    ])
    expect(items[0]).toMatchObject({ format: 'jpg', platformName: 'VK', width: 300, height: 250 })
  })

  it('matches format sections case-insensitively and trims whitespace', () => {
    harness.build([
      section(' webp ', [section('C', [section('P', [section('cr', [frame(10, 10)])])])]),
    ])
    const { items } = frameApi.scanPage()
    expect(items).toHaveLength(1)
    expect(items[0].format).toBe('webp')
    expect(items[0].path).toBe(' webp /C/P/cr/10x10.webp')
  })

  it('ignores unknown top-level sections, loose frames and non-section levels', () => {
    harness.build([
      section('Drafts', [section('C', [section('P', [section('cr', [frame(1, 1)])])])]),
      frame(500, 500),
      section('PNG', [
        frame(1, 1), // frame directly under format → ignored
        section('C', [frame(2, 2), section('P', [frame(3, 3), section('cr', [frame(4, 4)])])]),
      ]),
    ])
    const { items } = frameApi.scanPage()
    expect(items.map((item) => item.path)).toEqual(['PNG/C/P/cr/4x4.png'])
  })

  it('prunes empty creatives/platforms/channels/formats from the tree', () => {
    harness.build([
      section('JPG', [section('C', [section('P', [section('empty-creative', [])])])]),
      section('PNG', [section('C', [section('P', [section('cr', [frame(1, 1)])])])]),
    ])
    const { tree } = frameApi.scanPage()
    expect(tree.map((node) => node.name)).toEqual(['PNG'])
  })

  it('accepts COMPONENT and INSTANCE but not other node types', () => {
    harness.build([
      section('JPG', [
        section('C', [
          section('P', [
            section('cr', [
              frame(1, 1, { type: 'COMPONENT' }),
              frame(2, 2, { type: 'INSTANCE' }),
              frame(3, 3, { type: 'RECTANGLE' }),
            ]),
          ]),
        ]),
      ]),
    ])
    expect(frameApi.scanPage().items.map((item) => item.path)).toEqual([
      'JPG/C/P/cr/1x1.jpg',
      'JPG/C/P/cr/2x2.jpg',
    ])
  })

  it('rounds fractional sizes in file names and de-duplicates with _2, _3', () => {
    harness.build([
      section('JPG', [
        section('C', [
          section('P', [
            section('cr', [frame(240.00001525878906, 400), frame(240, 400), frame(240, 400)]),
          ]),
        ]),
      ]),
    ])
    expect(frameApi.scanPage().items.map((item) => item.path.split('/').pop())).toEqual([
      '240x400.jpg',
      '240x400_2.jpg',
      '240x400_3.jpg',
    ])
  })

  it('groups GIF frames by name + Y into one animation, ordered left-to-right', () => {
    const [gifSection] = harness.build([
      section('GIF', [
        section('C', [
          section('P', [
            section('cr', [
              frame(100, 50, { name: 'banner', x: 300, y: 0 }),
              frame(100, 50, { name: 'banner', x: 0, y: 0 }),
              frame(100, 50, { name: 'banner', x: 150, y: 0.4 }),
              frame(100, 50, { name: 'banner', x: 0, y: 200 }),
            ]),
          ]),
        ]),
      ]),
    ])
    const creative = gifSection.children[0].children[0].children[0]
    const [right, left, middle, secondRow] = creative.children

    const { tree, items } = frameApi.scanPage()

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      format: 'gif',
      path: 'GIF/C/P/cr/100x50.gif',
      nodeIds: [left.id, middle.id, right.id],
    })
    expect(items[1]).toMatchObject({ path: 'GIF/C/P/cr/100x50_2.gif', nodeIds: [secondRow.id] })
    const frames = tree[0].children![0].children![0].children![0].children!
    expect(frames.map((node) => node.size)).toEqual(['100x50 (3 frames)', '100x50 (1 frames)'])
  })

  it('rounds fractional GIF sizes in file names like the raster branch', () => {
    harness.build([
      section('GIF', [
        section('C', [section('P', [section('cr', [frame(240.00001525878906, 400)])])]),
      ]),
    ])
    expect(frameApi.scanPage().items[0].path).toBe('GIF/C/P/cr/240x400.gif')
  })

  it('returns empty results for an empty page', () => {
    expect(frameApi.scanPage()).toEqual({ tree: [], items: [] })
  })
})

describe('getSectionsHierarchy', () => {
  it('returns plain names, keeping empty levels (unlike scanPage)', () => {
    harness.build([
      section(' JPG ', [
        section('Context', [section('VK', [section('cr-1', []), section('cr-2', [])])]),
        section('Social', []),
      ]),
      section('Not a format', []),
    ])
    expect(frameApi.getSectionsHierarchy()).toEqual([
      {
        name: 'JPG',
        channels: [
          { name: 'Context', platforms: [{ name: 'VK', creatives: ['cr-1', 'cr-2'] }] },
          { name: 'Social', platforms: [] },
        ],
      },
    ])
  })
})

describe('updateExportItems', () => {
  it('replaces the shared export queue (live binding)', () => {
    const item = {
      path: 'a',
      format: 'jpg' as const,
      nodeIds: ['1'],
      platformName: 'p',
      width: 1,
      height: 1,
    }
    frameApi.updateExportItems([item])
    expect(frameApi.exportItems).toEqual([item])
  })
})
