# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Figma plugin ("Export Prod") for batch-exporting frames as JPG, PNG, WebP, or GIF with per-platform/per-frame file size limits, packaged into a ZIP download. UI labels are in Russian.

## Build Commands

```bash
npm run build     # Full build: code.ts + ui.tsx → dist/
npm run watch     # Watch mode for code.ts only (does NOT rebuild ui.html)
```

There are no tests or linting configured.

## Architecture

**Two-thread Figma plugin model:**

- `src/code.ts` — Main thread (Figma sandbox). Scans the page tree, exports frame pixels as PNG bytes, sends them to the UI one at a time via `postMessage`.
- `src/ui.tsx` — UI thread (iframe, Preact). Receives PNG bytes, converts to the target format, applies compression to meet size limits, assembles GIFs, builds the ZIP, and triggers download.

**Build pipeline (`scripts/build.js`):**
1. esbuild bundles `src/code.ts` → `dist/code.js`
2. Reads `gif.worker.js` from `node_modules/gif.js/dist/` and passes its content to esbuild via `define` as `__GIF_WORKER_CONTENT__` (lazily initialized in the UI via `URL.createObjectURL`)
3. esbuild bundles `src/ui.tsx` → `dist/ui.js` + `dist/ui.css` (JSX via preact/jsx-runtime)
4. Inlines `dist/ui.js` and `dist/ui.css` into `dist/ui.html`
5. Copies `manifest.json` from project root → `dist/manifest.json`

**`manifest.json`** lives at the project root with dist-relative paths (`"main": "code.js"`, `"ui": "ui.html"`). It is copied to `dist/` during build — do not edit `dist/manifest.json` directly.

## Expected Figma Page Structure

The plugin scans `figma.currentPage` for a 4-level nested section hierarchy:

```
Format section (JPG/PNG/WEBP/GIF)
  └─ Channel section
       └─ Platform section
            └─ Creative section
                 └─ Frame(s)
```

For GIF: frames at the same Y position are grouped into one animation, sorted left-to-right by X. Output filenames are `{width}x{height}.{ext}`, deduplicated with `_2`, `_3` suffixes.

## Compression Strategy

- **JPG/WebP**: Binary search over quality parameter (0.0–1.0) to hit size limit.
- **PNG**: Binary search over color quantization levels (2–256) to hit size limit.
- **GIF**: Binary search over gif.js `quality` parameter (1–30, lower = better).

Frame processing is sequential (one at a time) to avoid overloading the Figma plugin bridge.

## UI Features (`src/ui.tsx`)

### Export tab
- **Tree view** with collapsible format/channel/platform/creative nodes; sticky format headers
- **Per-frame size limits**: `FrameRow` component with hover highlight (`--figma-color-bg-hover`) and click-to-focus on limit input
- **Per-platform size limits**: global limits per format+platform combination
- **Search/filter**: filters the tree by name or size
- **Path mode**: segmented control to include or strip the format folder from ZIP paths
- **GIF delay**: configurable frame delay (seconds)
- **Preview HTML**: after export, downloads a self-contained HTML file for visual review
- **Resize handle**: drag bottom-right corner to resize the plugin window

### Place tab (Разместить)
- Select frames on the page, choose Format / Channel / Platform / Creative, click "Поместить в секции"
- Sections are created if they don't exist; frames are appended to existing creative sections (stacked vertically, or horizontally for GIF slides)
- **New section positioning**: new siblings are placed after existing ones (channels/platforms stack vertically; creatives stack horizontally within a platform)
- **Section fitting** (`fitSectionToChildren` in `code.ts`): works in local coordinates — shifts the section origin so content has `padding` space on all sides, compensates children's local positions to keep their absolute positions unchanged, then resizes. Uses local coords (not `absoluteBoundingBox`) to avoid stale values after `appendChild`.

## Key Dependencies

- `jszip` — ZIP assembly in the browser
- `gif.js` — GIF encoding with Web Workers (worker script injected via esbuild `define`)
- `preact` — UI framework
- `@create-figma-plugin/ui` — Figma-styled UI components
- `@figma/plugin-typings` — TypeScript types for Figma Plugin API
- `esbuild` — Bundler
