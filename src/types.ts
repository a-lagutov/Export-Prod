export interface TreeNode {
  name: string
  type: 'format' | 'channel' | 'platform' | 'creative' | 'frame'
  children?: TreeNode[]
  size?: string
}

export interface ExportItem {
  path: string
  format: 'jpg' | 'png' | 'webp' | 'gif'
  nodeIds: string[]
  platformName: string
  width: number
  height: number
}
