/**
 * Code-thread entry point (src/app/figma.ts): window setup, feature registration, the pull-based
 * init handshake (no push on startup) and page-level Figma events.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as config from '../../../src/shared/config'
import {
  createMockFigma,
  flushAsync,
  frame,
  loadCodeThread,
  section,
  type MockFigmaHarness,
} from '../../support/mock-figma'

let harness: MockFigmaHarness

beforeEach(async () => {
  harness = createMockFigma()
  harness.build([section('JPG', [section('C', [section('P', [section('cr', [frame(10, 10)])])])])])
  // figma.ts references the build-injected __html__ global.
  vi.stubGlobal('__html__', '<html></html>')
  await loadCodeThread(harness, () => import('../../../src/app/figma'))
  await flushAsync()
})

describe('app/figma.ts', () => {
  it('opens the UI with the configured window size and theme colours', () => {
    expect(harness.figma.showUI).toHaveBeenCalledWith('<html></html>', {
      width: config.WINDOW_WIDTH,
      height: config.WINDOW_HEIGHT,
      themeColors: true,
    })
  })

  it('does not push data on startup (UI pulls via scan / get-sections)', () => {
    expect(harness.sentMessages).toEqual([])
  })

  it('registers both features: scan and get-sections are answered', () => {
    harness.send('scan')
    harness.send('get-sections')
    expect(harness.sentMessages.map(([name]) => name)).toEqual([
      'scan-result',
      'sections-data',
      'selection-change',
    ])
  })

  it('resize keeps the fixed width and clamps height to WINDOW_MIN_HEIGHT', () => {
    harness.send('resize', { height: 10 })
    harness.send('resize', { height: 700 })
    expect(harness.figma.ui.resize.mock.calls).toEqual([
      [config.WINDOW_WIDTH, config.WINDOW_MIN_HEIGHT],
      [config.WINDOW_WIDTH, 700],
    ])
  })

  it('currentpagechange pushes scan-result, sections-data and selection-change', () => {
    harness.trigger('currentpagechange')
    expect(harness.sentMessages.map(([name]) => name)).toEqual([
      'scan-result',
      'sections-data',
      'selection-change',
    ])
  })

  it('selectionchange reports only FRAME nodes', () => {
    const [frameNode, component] = harness.build([frame(1, 1), frame(1, 1, { type: 'COMPONENT' })])
    harness.page.selection = [frameNode, component]
    harness.trigger('selectionchange')
    expect(harness.messagesNamed('selection-change')).toEqual([[{ count: 1 }]])
  })
})
