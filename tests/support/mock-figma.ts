/**
 * Minimal in-memory stand-in for the Figma Plugin API (`figma` global), covering exactly the
 * subset export-prod's code thread uses: page/section/frame tree, node lookup, section creation,
 * export, viewport, event subscriptions and the `figma.ui` message channel.
 *
 * Coordinates follow Figma semantics: a node's `x`/`y` are relative to its parent;
 * `absoluteBoundingBox` is derived by summing ancestor offsets (pages contribute nothing).
 */
import { vi } from 'vitest'

// Node global (no @types/node in this project — adding it would leak Node typings into src/).
declare function setImmediate(callback: () => void): unknown

export type MockNodeType = 'PAGE' | 'SECTION' | 'FRAME' | 'COMPONENT' | 'INSTANCE' | 'RECTANGLE'

/** Geometry accepted when creating nodes. */
export interface Geometry {
  x?: number
  y?: number
  width?: number
  height?: number
}

/** Declarative description of a frame-like leaf node for {@link MockFigmaHarness.build}. */
export interface FrameSpec extends Geometry {
  kind: 'leaf'
  type: 'FRAME' | 'COMPONENT' | 'INSTANCE' | 'RECTANGLE'
  name?: string
  width: number
  height: number
}

/** Declarative description of a section node for {@link MockFigmaHarness.build}. */
export interface SectionSpec extends Geometry {
  kind: 'section'
  name: string
  children: NodeSpec[]
}

export type NodeSpec = FrameSpec | SectionSpec

/**
 * A single node in the mock document tree. Implements the properties and methods the plugin
 * touches; everything else is intentionally absent so unexpected API usage fails loudly.
 */
export class MockNode {
  readonly id: string
  readonly type: MockNodeType
  name: string
  x: number
  y: number
  width: number
  height: number
  parent: MockNode | null = null
  children: MockNode[] = []
  fills: unknown[] = []
  /** Only meaningful on PAGE nodes. */
  selection: MockNode[] = []
  /** Export calls made on this node (settings objects), for assertions. */
  readonly exportCalls: unknown[] = []

  /**
   * Creates a detached node.
   * @param id - Unique node id.
   * @param type - Figma node type.
   * @param name - Layer name.
   * @param geometry - Initial position and size (defaults to 0/0/100/100).
   */
  constructor(id: string, type: MockNodeType, name: string, geometry: Geometry = {}) {
    this.id = id
    this.type = type
    this.name = name
    this.x = geometry.x ?? 0
    this.y = geometry.y ?? 0
    this.width = geometry.width ?? 100
    this.height = geometry.height ?? 100
  }

  /**
   * Moves `child` under this node, detaching it from its previous parent first
   * (mirrors Figma's reparenting behaviour; local x/y are kept as-is).
   * @param child - Node to append.
   */
  appendChild(child: MockNode): void {
    if (child.parent) {
      child.parent.children = child.parent.children.filter((sibling) => sibling !== child)
    }
    child.parent = this
    this.children.push(child)
  }

  /**
   * Resizes the node without applying constraints (SectionNode API).
   * @param width - New width.
   * @param height - New height.
   */
  resizeWithoutConstraints(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  /** Absolute bounds: own offset plus all non-page ancestors' offsets. */
  get absoluteBoundingBox(): { x: number; y: number; width: number; height: number } {
    let absoluteX = this.x
    let absoluteY = this.y
    let ancestor = this.parent
    while (ancestor && ancestor.type !== 'PAGE') {
      absoluteX += ancestor.x
      absoluteY += ancestor.y
      ancestor = ancestor.parent
    }
    return { x: absoluteX, y: absoluteY, width: this.width, height: this.height }
  }

  /**
   * Fake raster export: returns deterministic bytes that encode the node id, so tests can tell
   * which node produced which payload.
   * @param settings - Export settings passed by the plugin (recorded for assertions).
   * @returns Bytes of the form `PNG:<id>`.
   */
  async exportAsync(settings: unknown): Promise<Uint8Array> {
    this.exportCalls.push(settings)
    return new TextEncoder().encode(`PNG:${this.id}`)
  }
}

/** Everything a test needs to drive and inspect the mocked code thread. */
export interface MockFigmaHarness {
  /** The object to install as the global `figma`. */
  figma: MockFigmaApi
  /** The current page node. */
  page: MockNode
  /** Messages the code thread posted to the UI, as `[name, ...args]` arrays, in order. */
  sentMessages: unknown[][]
  /**
   * Simulates the UI thread emitting a message to the code thread (what `emit()` in the iframe does).
   * @param name - Message name.
   * @param args - Message arguments.
   */
  send(name: string, ...args: unknown[]): void
  /**
   * Fires a Figma document/page event (`documentchange`, `selectionchange`, `currentpagechange`).
   * @param event - Event name.
   * @param payload - Event payload passed to handlers.
   */
  trigger(event: string, payload?: unknown): void
  /**
   * Creates nodes from declarative specs under `parent` (the page by default).
   * @param specs - Node specs created in order.
   * @param parent - Parent node; defaults to the current page.
   * @returns The created top-level nodes.
   */
  build(specs: NodeSpec[], parent?: MockNode): MockNode[]
  /**
   * Finds the first node with the given name anywhere in the page (depth-first).
   * @param name - Layer name to look for.
   * @returns The node, or undefined.
   */
  findByName(name: string): MockNode | undefined
  /**
   * Returns all messages with the given name that the code thread posted to the UI.
   * @param name - Message name.
   * @returns Argument lists (without the name) of each matching message.
   */
  messagesNamed(name: string): unknown[][]
}

/** Shape of the mocked `figma` global. */
export interface MockFigmaApi {
  currentPage: MockNode
  root: MockNode
  ui: {
    postMessage: (message: unknown[]) => void
    onmessage: ((message: unknown) => void) | null
    resize: ReturnType<typeof vi.fn>
  }
  viewport: {
    center: { x: number; y: number }
    scrollAndZoomIntoView: ReturnType<typeof vi.fn>
  }
  showUI: ReturnType<typeof vi.fn>
  on: (event: string, handler: (payload: unknown) => void) => void
  createSection: () => MockNode
  getNodeByIdAsync: (id: string) => Promise<MockNode | null>
  loadAllPagesAsync: () => Promise<void>
}

/**
 * Creates a fresh mock Figma environment with an empty current page.
 * @returns A harness exposing the `figma` object plus helpers for building trees and messaging.
 */
export function createMockFigma(): MockFigmaHarness {
  let nextId = 1
  const allocateId = () => `${nextId++}:1`

  const root = new MockNode('0:0', 'PAGE', 'Document')
  const page = new MockNode('0:1', 'PAGE', 'Page 1')
  root.appendChild(page)

  const sentMessages: unknown[][] = []
  const eventHandlers = new Map<string, Array<(payload: unknown) => void>>()

  /**
   * Depth-first search over the page tree.
   * @param predicate - Match condition.
   * @returns The first matching node, or undefined.
   */
  function findNode(predicate: (node: MockNode) => boolean): MockNode | undefined {
    const stack = [...page.children]
    while (stack.length > 0) {
      const node = stack.shift()!
      if (predicate(node)) return node
      stack.unshift(...node.children)
    }
    return undefined
  }

  const figmaApi: MockFigmaApi = {
    currentPage: page,
    root,
    ui: {
      postMessage: (message) => {
        sentMessages.push(message)
      },
      onmessage: null,
      resize: vi.fn(),
    },
    viewport: {
      center: { x: 0, y: 0 },
      scrollAndZoomIntoView: vi.fn(),
    },
    showUI: vi.fn(),
    on: (event, handler) => {
      if (!eventHandlers.has(event)) eventHandlers.set(event, [])
      eventHandlers.get(event)!.push(handler)
    },
    // Real Figma appends newly created nodes to the current page.
    createSection: () => {
      const section = new MockNode(allocateId(), 'SECTION', 'Section')
      page.appendChild(section)
      return section
    },
    getNodeByIdAsync: async (id) => findNode((node) => node.id === id) ?? null,
    loadAllPagesAsync: async () => {},
  }

  /**
   * Recursively instantiates specs under a parent.
   * @param specs - Specs to create.
   * @param parent - Parent node.
   * @returns Created nodes (same order as specs).
   */
  function build(specs: NodeSpec[], parent: MockNode = page): MockNode[] {
    return specs.map((spec) => {
      if (spec.kind === 'section') {
        const section = new MockNode(allocateId(), 'SECTION', spec.name, spec)
        parent.appendChild(section)
        build(spec.children, section)
        return section
      }
      const leafName = spec.name ?? `${spec.width}x${spec.height}`
      const leaf = new MockNode(allocateId(), spec.type, leafName, spec)
      parent.appendChild(leaf)
      return leaf
    })
  }

  return {
    figma: figmaApi,
    page,
    sentMessages,
    send(name, ...args) {
      if (!figmaApi.ui.onmessage) {
        throw new Error('figma.ui.onmessage is not set — import the code-thread module first')
      }
      figmaApi.ui.onmessage([name, ...args])
    },
    trigger(event, payload) {
      for (const handler of eventHandlers.get(event) ?? []) handler(payload)
    },
    build,
    findByName: (name) => findNode((node) => node.name === name),
    messagesNamed: (name) =>
      sentMessages.filter(([messageName]) => messageName === name).map(([, ...args]) => args),
  }
}

/**
 * Spec helper for a section node.
 * @param name - Section name.
 * @param children - Child specs.
 * @param geometry - Optional position/size.
 * @returns A section spec.
 */
export function section(
  name: string,
  children: NodeSpec[] = [],
  geometry: Geometry = {},
): SectionSpec {
  return { kind: 'section', name, children, ...geometry }
}

/**
 * Spec helper for a frame-like leaf node.
 * @param width - Width in px.
 * @param height - Height in px.
 * @param options - Optional name, type (FRAME by default) and position.
 * @returns A leaf spec.
 */
export function frame(
  width: number,
  height: number,
  options: { name?: string; type?: FrameSpec['type']; x?: number; y?: number } = {},
): FrameSpec {
  return { kind: 'leaf', type: options.type ?? 'FRAME', width, height, ...options }
}

/**
 * Installs the harness as the global `figma` and re-imports code-thread modules from scratch,
 * so `@create-figma-plugin/utilities` binds `figma.ui.onmessage` to this harness and module-level
 * state (handler registry, export queue) starts clean.
 * @param harness - Harness to install.
 * @param importModules - Callback that dynamically imports the modules under test.
 * @returns Whatever `importModules` resolves to.
 */
export async function loadCodeThread<T>(
  harness: MockFigmaHarness,
  importModules: () => Promise<T>,
): Promise<T> {
  vi.stubGlobal('figma', harness.figma)
  vi.resetModules()
  return importModules()
}

/**
 * Lets all pending promise chains settle. The mock API resolves immediately, so one macrotask
 * boundary drains every microtask an async handler queued.
 */
export function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
