/**
 * Code-thread export protocol (features/export-frames/api), driven through the real
 * `@create-figma-plugin/utilities` emit/on channel: tests send UI→code messages via
 * `figma.ui.onmessage` and assert the `[name, ...args]` messages posted back to the UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockFigma,
  flushAsync,
  frame,
  loadCodeThread,
  section,
  type MockFigmaHarness,
} from '../../support/mock-figma'

let harness: MockFigmaHarness
let frameApi: typeof import('../../../src/entities/frame/api')

beforeEach(async () => {
  harness = createMockFigma()
  const [exportApi, entities] = await loadCodeThread(harness, () =>
    Promise.all([
      import('../../../src/features/export-frames/api'),
      import('../../../src/entities/frame/api'),
    ]),
  )
  frameApi = entities
  exportApi.register()
  // register() subscribes to documentchange after an awaited loadAllPagesAsync().
  await flushAsync()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Two JPG frames on VK, one on TG, and a two-slide GIF on VK. */
function buildTypicalPage() {
  harness.build([
    section('JPG', [
      section('Context', [
        section('VK', [
          section('card', [
            frame(300.4, 250, { name: 'old-name-a', y: 0 }),
            frame(300, 600, { name: 'old-name-b', y: 400 }),
          ]),
        ]),
        section('TG', [section('card', [frame(1080, 1920)])]),
      ]),
    ]),
    section('GIF', [
      section('Context', [
        section('VK', [
          section('anim', [
            frame(100, 50, { name: 'slide', x: 200, y: 0 }),
            frame(100, 50, { name: 'slide', x: 0, y: 0 }),
          ]),
        ]),
      ]),
    ]),
  ])
}

describe('scan', () => {
  it('replies with scan-result and fills the export queue', () => {
    buildTypicalPage()
    harness.send('scan')
    const [[payload]] = harness.messagesNamed('scan-result') as [[{ items: unknown[] }]]
    expect(payload.items).toHaveLength(4)
    expect(frameApi.exportItems).toHaveLength(4)
  })
})

describe('rename-frames', () => {
  it('renames FRAME nodes to rounded {w}x{h}, rescans and replies rename-done last', async () => {
    buildTypicalPage()
    harness.send('scan')
    harness.sentMessages.length = 0

    harness.send('rename-frames', {})
    await flushAsync()

    expect(harness.findByName('300x250')).toBeDefined()
    expect(harness.findByName('300x600')).toBeDefined()
    expect(harness.findByName('old-name-a')).toBeUndefined()
    const names = harness.sentMessages.map(([name]) => name)
    expect(names.filter((name) => name !== 'code-log')).toEqual(['scan-result', 'rename-done'])
    expect(frameApi.exportItems).toHaveLength(4)
  })

  it.each([
    [{ filterFormat: 'JPG' }, ['jpg', 'jpg', 'jpg']],
    [{ filterPlatform: 'VK' }, ['jpg', 'jpg', 'gif']],
    [{ filterFormat: 'jpg', filterPlatform: 'TG' }, ['jpg']],
  ])('filters the export queue by %o but still reports the full tree', async (filter, formats) => {
    buildTypicalPage()
    harness.send('scan')

    harness.send('rename-frames', filter)
    await flushAsync()

    expect(frameApi.exportItems.map((item) => item.format)).toEqual(formats)
    const lastScan = harness.messagesNamed('scan-result').pop() as [{ items: unknown[] }]
    expect(lastScan[0].items).toHaveLength(4)
  })
})

describe('start-export / request-frame', () => {
  it('streams frames one by one and finishes with export-complete', async () => {
    buildTypicalPage()
    harness.send('scan')

    harness.send('start-export')
    await flushAsync()
    const [[first]] = harness.messagesNamed('frame-data') as [[Record<string, unknown>]]
    expect(first).toMatchObject({
      index: 0,
      total: 4,
      path: 'JPG/Context/VK/card/300x250.jpg',
      format: 'jpg',
      platformName: 'VK',
    })
    const firstNode = harness.findByName('old-name-a')!
    expect(new TextDecoder().decode(first.pngBytes as Uint8Array)).toBe(`PNG:${firstNode.id}`)
    expect(firstNode.exportCalls).toEqual([
      { format: 'PNG', constraint: { type: 'SCALE', value: 1 } },
    ])

    for (const index of [1, 2, 3, 4]) {
      harness.send('request-frame', { index })
      await flushAsync()
    }

    expect(harness.messagesNamed('frame-data')).toHaveLength(3)
    expect(harness.messagesNamed('gif-data')).toHaveLength(1)
    expect(harness.messagesNamed('export-complete')).toHaveLength(1)
    expect(harness.sentMessages.at(-1)).toEqual(['export-complete'])
  })

  it('sends all GIF slides left-to-right in one gif-data message', async () => {
    buildTypicalPage()
    harness.send('scan')
    const gifIndex = frameApi.exportItems.findIndex((item) => item.format === 'gif')

    harness.send('request-frame', { index: gifIndex })
    await flushAsync()

    const [[gif]] = harness.messagesNamed('gif-data') as [[Record<string, unknown>]]
    const anim = harness.findByName('anim')!
    const leftFirst = [...anim.children].sort((a, b) => a.x - b.x)
    expect((gif.frames as Uint8Array[]).map((bytes) => new TextDecoder().decode(bytes))).toEqual(
      leftFirst.map((node) => `PNG:${node.id}`),
    )
    expect(gif).toMatchObject({ path: 'GIF/Context/VK/anim/100x50.gif', width: 100, height: 50 })
  })

  it('start-export with an empty queue completes immediately', async () => {
    harness.send('scan')
    harness.send('start-export')
    await flushAsync()
    expect(harness.messagesNamed('frame-data')).toHaveLength(0)
    expect(harness.messagesNamed('export-complete')).toHaveLength(1)
  })
})

describe('documentchange auto-rescan', () => {
  /**
   * Fires a documentchange for the given node.
   * @param node - Changed node.
   */
  function changeNode(node: unknown) {
    harness.trigger('documentchange', { documentChanges: [{ node }] })
  }

  it('debounces relevant changes into a single rescan', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    buildTypicalPage()
    const node = harness.findByName('card')!

    changeNode(node)
    vi.advanceTimersByTime(300)
    changeNode(node)
    vi.advanceTimersByTime(499)
    expect(harness.messagesNamed('scan-result')).toHaveLength(0)

    vi.advanceTimersByTime(1)
    expect(harness.messagesNamed('scan-result')).toHaveLength(1)
    expect(harness.messagesNamed('sections-data')).toHaveLength(1)
  })

  it('ignores changes on other pages', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const otherPage = { id: '9:9', type: 'PAGE', parent: null }
    changeNode({ id: '9:10', type: 'FRAME', parent: otherPage })
    vi.advanceTimersByTime(1000)
    expect(harness.messagesNamed('scan-result')).toHaveLength(0)
  })

  it('is suppressed while an export is running', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    buildTypicalPage()
    harness.send('scan')
    harness.send('rename-frames', {})
    await flushAsync()
    const scansBefore = harness.messagesNamed('scan-result').length

    changeNode(harness.findByName('card'))
    vi.advanceTimersByTime(1000)
    expect(harness.messagesNamed('scan-result')).toHaveLength(scansBefore)

    // request-frame past the end clears the exporting flag → rescans resume.
    harness.send('request-frame', { index: 999 })
    await flushAsync()
    changeNode(harness.findByName('card'))
    vi.advanceTimersByTime(1000)
    expect(harness.messagesNamed('scan-result')).toHaveLength(scansBefore + 1)
  })
})
