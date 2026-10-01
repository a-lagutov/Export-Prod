import { describe, expect, it } from 'vitest'
import {
  countFrames,
  filterFlatRows,
  filterNode,
  filterTree,
  flattenToRows,
} from '../../../src/entities/frame/model/tree'
import type { TreeNode } from '../../../src/entities/frame/model/types'

/** A representative two-format tree as produced by scanPage(). */
const TREE: TreeNode[] = [
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
  {
    name: 'GIF',
    type: 'format',
    children: [
      {
        name: 'Social',
        type: 'channel',
        children: [
          {
            name: 'TG',
            type: 'platform',
            children: [
              {
                name: '5678-story',
                type: 'creative',
                children: [{ name: '1080x1920.gif', type: 'frame', size: '1080x1920 (3 frames)' }],
              },
            ],
          },
        ],
      },
    ],
  },
]

describe('filterTree / filterNode', () => {
  it('returns the same array for an empty query', () => {
    expect(filterTree(TREE, '')).toBe(TREE)
  })

  it('keeps only branches containing a matching frame', () => {
    const result = filterTree(TREE, '600')
    expect(result).toHaveLength(1)
    const creative = result[0].children![0].children![0].children![0]
    expect(creative.children!.map((node) => node.name)).toEqual(['300x600.jpg'])
  })

  it('is case-insensitive and matches branch names', () => {
    const result = filterTree(TREE, 'tg')
    expect(result.map((node) => node.name)).toEqual(['GIF'])
  })

  it('a branch whose own name matches but has no matching children is kept with empty children', () => {
    const result = filterNode(TREE[0].children![0], 'context')
    expect(result).toEqual({ ...TREE[0].children![0], children: [] })
  })

  it('matches frames by size string too', () => {
    const result = filterTree(TREE, '3 frames')
    expect(result.map((node) => node.name)).toEqual(['GIF'])
  })

  it('returns [] when nothing matches and does not mutate the input', () => {
    const snapshot = JSON.stringify(TREE)
    expect(filterTree(TREE, 'zzz')).toEqual([])
    expect(JSON.stringify(TREE)).toBe(snapshot)
  })
})

describe('countFrames', () => {
  it('counts frame leaves in a subtree as a string', () => {
    expect(countFrames(TREE[0])).toBe('2')
    expect(countFrames(TREE[1])).toBe('1')
    expect(countFrames({ name: 'x', type: 'format', children: [] })).toBe('0')
  })
})

describe('flattenToRows', () => {
  const rows = flattenToRows(TREE)

  it('emits one row per frame with full path context', () => {
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      key: '300x250.jpg_jpg',
      formatTag: 'jpg',
      channel: 'Context',
      platform: 'VK',
      creative: '1234-card',
      frameName: '300x250',
      gifFrameInfo: undefined,
    })
  })

  it('extracts GIF frame count only for GIF rows', () => {
    expect(rows[2].gifFrameInfo).toBe('(3 frames)')
    expect(rows[2].frameName).toBe('1080x1920')
  })
})

describe('filterFlatRows', () => {
  const rows = flattenToRows(TREE)

  it('returns the same array for an empty query', () => {
    expect(filterFlatRows(rows, '')).toBe(rows)
  })

  it.each([
    ['frame name', '300x6', ['300x600']],
    ['format', 'gif', ['1080x1920']],
    ['channel', 'CONTEXT', ['300x250', '300x600']],
    ['platform', 'tg', ['1080x1920']],
    ['creative', '1234', ['300x250', '300x600']],
  ])('matches by %s', (_field, query, expectedFrames) => {
    expect(filterFlatRows(rows, query).map((row) => row.frameName)).toEqual(expectedFrames)
  })
})
