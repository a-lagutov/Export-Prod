// Export Prod — Figma plugin main thread
import type { TreeNode, ExportItem } from './types'

const FORMATS = ['jpg', 'png', 'webp', 'gif'] as const;

function isSection(node: SceneNode): node is SectionNode {
  return node.type === 'SECTION';
}

function isFrame(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME';
}

function scanPage(): { tree: TreeNode[], items: ExportItem[] } {
  const tree: TreeNode[] = [];
  const items: ExportItem[] = [];

  for (const topChild of figma.currentPage.children) {
    if (!isSection(topChild)) continue;
    const formatName = topChild.name.trim().toUpperCase();
    const format = FORMATS.find(f => f === formatName.toLowerCase());
    if (!format) continue;

    const formatTree: TreeNode = { name: topChild.name, type: 'format', children: [] };

    for (const channelNode of topChild.children) {
      if (!isSection(channelNode)) continue;
      const channelTree: TreeNode = { name: channelNode.name, type: 'channel', children: [] };

      for (const platformNode of channelNode.children) {
        if (!isSection(platformNode)) continue;
        const platformTree: TreeNode = { name: platformNode.name, type: 'platform', children: [] };

        for (const creativeNode of platformNode.children) {
          if (!isSection(creativeNode)) continue;
          const creativeTree: TreeNode = { name: creativeNode.name, type: 'creative', children: [] };

          const frames = creativeNode.children.filter(isFrame);

          if (format === 'gif') {
            // Group frames by name + y position
            const groups = new Map<string, FrameNode[]>();
            for (const frame of frames) {
              const key = `${frame.name}_y${Math.round(frame.y)}`;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(frame);
            }

            const sizeCount = new Map<string, number>();
            for (const [, groupFrames] of groups) {
              // Sort by x position (left to right)
              groupFrames.sort((a, b) => a.x - b.x);
              const w = groupFrames[0].width;
              const h = groupFrames[0].height;
              const sizeKey = `${w}x${h}`;
              const count = (sizeCount.get(sizeKey) || 0) + 1;
              sizeCount.set(sizeKey, count);
              const suffix = count > 1 ? `_${count}` : '';
              const fileName = `${sizeKey}${suffix}.gif`;
              const path = `${topChild.name}/${channelNode.name}/${platformNode.name}/${creativeNode.name}/${fileName}`;

              items.push({
                path,
                format: 'gif',
                nodeIds: groupFrames.map(f => f.id),
                platformName: platformNode.name,
                width: w,
                height: h,
              });

              creativeTree.children!.push({
                name: fileName,
                type: 'frame',
                size: `${w}x${h} (${groupFrames.length} frames)`,
              });
            }
          } else {
            const sizeCount = new Map<string, number>();
            for (const frame of frames) {
              const sizeKey = `${frame.width}x${frame.height}`;
              const count = (sizeCount.get(sizeKey) || 0) + 1;
              sizeCount.set(sizeKey, count);
              const suffix = count > 1 ? `_${count}` : '';
              const ext = format;
              const fileName = `${sizeKey}${suffix}.${ext}`;
              const path = `${topChild.name}/${channelNode.name}/${platformNode.name}/${creativeNode.name}/${fileName}`;

              items.push({
                path,
                format,
                nodeIds: [frame.id],
                platformName: platformNode.name,
                width: frame.width,
                height: frame.height,
              });

              creativeTree.children!.push({
                name: fileName,
                type: 'frame',
                size: sizeKey,
              });
            }
          }

          if (creativeTree.children!.length > 0) {
            platformTree.children!.push(creativeTree);
          }
        }
        if (platformTree.children!.length > 0) {
          channelTree.children!.push(platformTree);
        }
      }
      if (channelTree.children!.length > 0) {
        formatTree.children!.push(channelTree);
      }
    }
    if (formatTree.children!.length > 0) {
      tree.push(formatTree);
    }
  }

  return { tree, items };
}

let exportItems: ExportItem[] = [];

figma.showUI(__html__, { width: 400, height: 560, themeColors: true });

// Auto-scan on plugin open
{
  const result = scanPage();
  exportItems = result.items;
  figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items });
}

// Re-scan when page selection changes
figma.on('currentpagechange', () => {
  const result = scanPage();
  exportItems = result.items;
  figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items });
});

figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
  if (msg.type === 'scan') {
    const result = scanPage();
    exportItems = result.items;
    figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items });
  }

  if (msg.type === 'resize') {
    const h = msg.height as number;
    figma.ui.resize(400, Math.max(200, h));
  }

  if (msg.type === 'rename-frames') {
    // Rename all frames to their dimensions (e.g. "1080x1920")
    for (const item of exportItems) {
      for (const nodeId of item.nodeIds) {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node && (node.type === 'FRAME')) {
          const frameName = `${(node as FrameNode).width}x${(node as FrameNode).height}`;
          node.name = frameName;
        }
      }
    }
    // Re-scan to update tree with new names
    const result = scanPage();
    exportItems = result.items;
    figma.ui.postMessage({ type: 'scan-result', tree: result.tree, items: result.items });
    figma.ui.postMessage({ type: 'rename-done' });
  }

  if (msg.type === 'start-export') {
    // Send first frame
    if (exportItems.length > 0) {
      await sendFrame(0);
    } else {
      figma.ui.postMessage({ type: 'export-complete' });
    }
  }

  if (msg.type === 'request-frame') {
    const index = msg.index as number;
    if (index < exportItems.length) {
      await sendFrame(index);
    } else {
      figma.ui.postMessage({ type: 'export-complete' });
    }
  }
};

async function sendFrame(index: number) {
  const item = exportItems[index];
  const total = exportItems.length;
  const exportSettings: ExportSettings = { format: 'PNG', constraint: { type: 'SCALE', value: 1 } };

  if (item.format === 'gif') {
    // Export all gif frames
    const framesData: Uint8Array[] = [];
    for (const nodeId of item.nodeIds) {
      const node = (await figma.getNodeByIdAsync(nodeId)) as FrameNode;
      const bytes = await node.exportAsync(exportSettings);
      framesData.push(bytes);
    }
    figma.ui.postMessage({
      type: 'gif-data',
      index,
      total,
      path: item.path,
      frames: framesData,
      platformName: item.platformName,
      width: item.width,
      height: item.height,
    });
  } else {
    const node = (await figma.getNodeByIdAsync(item.nodeIds[0])) as FrameNode;
    const pngBytes = await node.exportAsync(exportSettings);
    figma.ui.postMessage({
      type: 'frame-data',
      index,
      total,
      path: item.path,
      format: item.format,
      pngBytes,
      platformName: item.platformName,
      width: item.width,
      height: item.height,
    });
  }
}
