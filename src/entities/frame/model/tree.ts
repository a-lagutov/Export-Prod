import type { TreeNode } from './types'

export interface FlatRow {
  key: string
  formatTag: string
  channel: string
  platform: string
  creative: string
  frameName: string
  gifFrameInfo?: string
}

/**
 * Filters a tree of nodes by a search query, returning only branches that contain matching nodes.
 * Returns the original array unchanged if the query is empty.
 * @param nodes - Top-level format nodes to filter.
 * @param query - Case-insensitive search string.
 */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes
  const q = query.toLowerCase()
  return nodes.map((node) => filterNode(node, q)).filter((n): n is TreeNode => n !== null)
}

/**
 * Recursively filters a single node against a query.
 * For frame nodes: returns the node if its name or size matches, otherwise null.
 * For branch nodes: returns a pruned copy keeping only matching subtrees, or null if nothing matches.
 * @param node - The node to filter.
 * @param query - Lowercase search string (caller must pre-lowercase).
 */
export function filterNode(node: TreeNode, query: string): TreeNode | null {
  if (node.type === 'frame') {
    const matches =
      node.name.toLowerCase().includes(query) ||
      (node.size && node.size.toLowerCase().includes(query))
    return matches ? node : null
  }
  // For non-leaf nodes, check if the node name matches or any children match
  const nameMatches = node.name.toLowerCase().includes(query)
  if (!node.children) return nameMatches ? node : null
  const filteredChildren = node.children
    .map((c) => filterNode(c, query))
    .filter((c): c is TreeNode => c !== null)
  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren }
  }
  return nameMatches ? { ...node, children: [] } : null
}

/**
 * Counts all frame-type leaf nodes within a subtree.
 * @param node - Root of the subtree to count.
 * @returns The frame count as a string (for direct use in UI labels).
 */
export function countFrames(node: TreeNode): string {
  let count = 0
  function walk(n: TreeNode) {
    if (n.type === 'frame') count++
    n.children?.forEach(walk)
  }
  walk(node)
  return `${count}`
}

/**
 * Flattens the 4-level section tree into a list of rows for the table view.
 * Each row represents one frame leaf with its full path context (format, channel, platform, creative).
 * @param nodes - Top-level format nodes from the tree.
 * @returns A flat array of {@link FlatRow} objects ready for rendering in `TableRow`.
 */
export function flattenToRows(nodes: TreeNode[]): FlatRow[] {
  const rows: FlatRow[] = []
  for (const fmt of nodes) {
    const formatTag = fmt.name.toLowerCase()
    for (const ch of fmt.children ?? []) {
      for (const pl of ch.children ?? []) {
        for (const cr of pl.children ?? []) {
          for (const fr of cr.children ?? []) {
            if (fr.type === 'frame') {
              const gifInfo =
                formatTag === 'gif' ? fr.size?.match(/\(\d+ frames?\)/)?.[0] : undefined
              rows.push({
                key: `${fr.name}_${formatTag}`,
                formatTag,
                channel: ch.name,
                platform: pl.name,
                creative: cr.name,
                frameName: fr.name.replace(/\.[^.]+$/, ''),
                gifFrameInfo: gifInfo,
              })
            }
          }
        }
      }
    }
  }
  return rows
}

/**
 * Filters a flat list of frame rows by a search query, matching against
 * frame name, format, channel, platform, and creative fields.
 * Returns the original array unchanged if the query is empty.
 * @param rows - Flat rows produced by {@link flattenToRows}.
 * @param query - Case-insensitive search string.
 */
export function filterFlatRows(rows: FlatRow[], query: string): FlatRow[] {
  if (!query) return rows
  const q = query.toLowerCase()
  return rows.filter(
    (r) =>
      r.frameName.toLowerCase().includes(q) ||
      r.formatTag.includes(q) ||
      r.channel.toLowerCase().includes(q) ||
      r.platform.toLowerCase().includes(q) ||
      r.creative.toLowerCase().includes(q),
  )
}
