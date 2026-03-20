# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Figma plugin ("Export Prod") for batch-exporting frames as JPG, PNG, WebP, or GIF with per-platform/per-frame file size limits, packaged into a ZIP download. UI labels are in Russian.

## Build Commands

```bash
npm run build     # Full build: code.ts + ui.tsx → dist/ (NODE_ENV=production)
npm run watch     # Watch mode: rebuilds both code.ts and ui.tsx on changes (NODE_ENV=development)
```

Linting and formatting are configured via ESLint + Prettier with a Husky pre-commit hook. Run `npm run prepare` once after cloning to activate the hook.

## Environment Variables

Env files are loaded in CRA priority order and injected at build time via esbuild `define` as `__VAR__` constants. Only `POSTHOG_*` variables are injected.

Priority for `npm run build`: `.env.production.local` > `.env.local` > `.env.production` > `.env`
Priority for `npm run watch`: `.env.development.local` > `.env.local` > `.env.development` > `.env`

Committed (non-secret defaults): `.env`, `.env.production`, `.env.development`
Gitignored (local overrides): `.env.local`, `.env.*.local`

| Variable | Where | Purpose |
|---|---|---|
| `POSTHOG_KEY` | `.env.production.local` (gitignored) | Analytics key for production |
| `POSTHOG_KEY` | `.env.development.local` (gitignored) | Analytics key for development |
| `POSTHOG_HOST` | `.env` (committed) | Analytics host; also injected into `dist/manifest.json` → `networkAccess.allowedDomains` |
| `PLUGIN_NAME` | `.env` (committed) | Plugin display name in Figma; injected into `dist/manifest.json` → `name` |

If a variable is absent, it defaults to an empty string and analytics are silently disabled.

## Architecture

**Two-thread Figma plugin model:**

- `src/code.ts` — Main thread (Figma sandbox). Scans the page tree, exports frame pixels as PNG bytes, sends them to the UI one at a time via `postMessage`.
- `src/ui.tsx` — UI thread (iframe, Preact). Receives PNG bytes, converts to the target format, applies compression to meet size limits, assembles GIFs, builds the ZIP, and triggers download.

**Build pipeline (`scripts/build.js`):**
1. esbuild bundles `src/code.ts` → `dist/code.js`
2. Reads `gif.worker.js` from `node_modules/gif.js/dist/` and passes its content to esbuild via `define` as `__GIF_WORKER_CONTENT__` (lazily initialized in the UI via `URL.createObjectURL`)
3. Loads env files (CRA priority order), injects `POSTHOG_*` vars as `__VAR__` constants; also injects `__VERSION__` (from `git describe --tags --abbrev=0`, fallback to `package.json`) and `__DEV__` (`true` in watch mode, `false` in production)
4. esbuild bundles `src/ui.tsx` → `dist/ui.js` + `dist/ui.css` (JSX via preact/jsx-runtime)
5. Inlines `dist/ui.js` and `dist/ui.css` into `dist/ui.html`
6. Calls `manifest.js(env)` and writes the result to `dist/manifest.json` (injects `PLUGIN_NAME` → `name`, `POSTHOG_HOST` → `networkAccess.allowedDomains`)

**`manifest.js`** at the project root is the source of truth for the manifest — it exports a factory `(env) => ({...})`. Do not edit `dist/manifest.json` directly.

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
- **Numeric inputs** (`NumInput`, `FrameRow` limit field): `type="text"` with `inputMode="decimal"`. Input is filtered on change — only digits and one decimal dot allowed; commas are converted to dots. On blur: trailing dot is stripped, value `<= 0` clears to empty (empty = no limit). Do not switch these back to `type="number"`.
- **Search/filter**: filters the tree by name or size
- **Path mode**: segmented control to include or strip the format folder from ZIP paths
- **GIF delay**: configurable frame delay (seconds)
- **Preview HTML**: after export, downloads a self-contained HTML file for visual review. All Figma node names and file paths are HTML-escaped via `escHtml()` before insertion to prevent XSS.
- **Resize handle**: drag bottom-right corner to resize the plugin window
- **Sticky tab bar**: tab bar (`Экспорт` / `Разместить`) is `position: sticky; top: 0` so it stays visible while scrolling.
- **Fixed bottom buttons**: the Export button (phase `ready`) and the Download + "Очистить экспорт" group (phase `done`) are `position: fixed; bottom: 0` and always visible. The content area gets extra `paddingBottom` to avoid overlap. Button padding is overridden via an injected `<style>` tag targeting the `.export-btn-wrap` class (the `Button` component from `@create-figma-plugin/ui` does not accept a padding prop).
- **Progress bar**: shown only during export (`phase === 'exporting'`); hidden after completion. No "Done" status text is shown.
- **Download button label**: shows the ZIP size and file count — e.g. `Скачать ZIP · 2.34 МБ · 42 файла`. If a partial export was run (by format or platform), the label also includes the filter — e.g. `Скачать ZIP JPG · …` or `Скачать ZIP VK · …`.

### Place tab (Разместить)
- Select frames on the page, choose Format / Channel / Platform / Creative, click "Поместить в секции"
- Sections are created if they don't exist; frames are appended to existing creative sections (stacked vertically, or horizontally for GIF slides)
- **New section positioning**: new siblings are placed after existing ones (channels/platforms stack vertically; creatives stack horizontally within a platform)
- **New format section positioning**: if other format sections already exist on the page, the new one is placed 5000px to the right of the rightmost; if no format sections exist yet, it is placed at the absolute position of the selected frames and automatically selected in Figma
- **Section fitting** (`fitSectionToChildren` in `code.ts`): works in local coordinates — shifts the section origin so content has `padding` space on all sides, compensates children's local positions to keep their absolute positions unchanged, then resizes. Uses local coords (not `absoluteBoundingBox`) to avoid stale values after `appendChild`.

## Analytics (`src/analytics.ts`)

PostHog EU, fire-and-forget via fetch. Key and host injected at build time — not hardcoded in source.

**Note:** Figma plugin UI runs in a `data:` URL iframe — `localStorage` is blocked. The `distinct_id` is a session-scoped random ID (regenerated each plugin open).

Every event includes `version` (git tag, e.g. `v1.3.0`). In dev mode (`__DEV__ = true`), events also include `$set: { is_test_user: true }` for filtering in PostHog.

Tracked events: `plugin_opened`, `export_started`, `export_completed`, `export_cancelled`, `export_error`, `frames_placed`.

## Releases

Releases are created automatically via GitHub Actions (`.github/workflows/release.yml`) when a version tag is pushed:

```bash
git tag v1.2
git push origin v1.2
```

The workflow builds the plugin and attaches the ZIP (`dist/`) to the GitHub release. Do not create releases manually.

**Release notes** should only cover changes that are visible to the end user or affect their security: new UI features, changed behaviour, bug fixes users will notice, and security fixes. Do not mention internal tooling, dependency upgrades, build pipeline changes, or CI/CD fixes unless they directly affect the user-facing product.

## Key Dependencies

- `jszip` — ZIP assembly in the browser
- `gif.js` — GIF encoding with Web Workers (worker script injected via esbuild `define`)
- `preact` — UI framework
- `@create-figma-plugin/ui` — Figma-styled UI components
- `@figma/plugin-typings` — TypeScript types for Figma Plugin API
- `esbuild` — Bundler

## TypeScript / IDE Notes

- `tsconfig.json` uses `"moduleResolution": "bundler"` — required for VS Code to resolve modern packages (preact, jszip, etc.) that use the `exports` field in `package.json`. Do not change this to `node`.
- `Uint8Array` received from the Figma plugin bridge has type `Uint8Array<ArrayBufferLike>`, which is not directly assignable to `BlobPart`. Cast with `as BlobPart` where needed (e.g. `new Blob([bytes as BlobPart])`).
- After cloning, run `npm run prepare` to install the Husky pre-commit hook (lint-staged + ESLint + Prettier check).
