# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## Code Style

### Function Comments

All functions need comments. JSDoc (`/** ... */`) for all public functions, hooks, utilities. Non-obvious logic inside functions → inline comments (`//`).

Reference: https://jsdoc.app

### Variable Naming

Names readable, descriptive. No abbreviations like `cb`, `fn`, `v`, `tmp`.

- Functions and variables: `camelCase`
- React/Preact components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

References: [Airbnb Style Guide](https://github.com/airbnb/javascript), [TypeScript Style Guide](https://basarat.gitbook.io/typescript/styleguide)

## Commit Messages

Commit messages English only.

## What This Is

Figma plugin ("Export Prod"). Batch-export frames as JPG, PNG, WebP, GIF with per-platform/per-frame file size limits, packed into ZIP download. UI labels Russian.

## Build Commands

```bash
npm run build     # Full build: app/figma.ts + app/index.tsx → dist/ (NODE_ENV=production)
npm run watch     # Watch mode: rebuilds both app/figma.ts and app/index.tsx on changes (NODE_ENV=development)
```

### Tests (level 1 — headless, Vitest)

```bash
npm test          # vitest run — tests/unit/**/*.test.ts
npm run test:watch
npx tsc -p tests  # type-check tests (src/ has pre-existing type errors — filter output to files you care about)
```

- `tests/support/mock-figma.ts` — in-memory `figma` global (page/section/frame tree, `createSection`, `getNodeByIdAsync`, `exportAsync`, viewport, events, `figma.ui` channel). `loadCodeThread()` installs it, re-imports modules so `@create-figma-plugin/utilities` binds to it; `harness.send(name, ...args)` simulates UI `emit`, `harness.messagesNamed(name)` reads code-thread emits, `flushAsync()` settles async handlers.
- `tests/support/fake-canvas.ts` — fake `<canvas>`/`ImageData` with pluggable size model; tests compression search/selection without real codecs.
- `vitest.config.mts` pins `__DEV__`/`__LOG_SERVER__`/`__POSTHOG_*__`/`__VERSION__`, inlines `@create-figma-plugin/utilities` (needed for per-test module reset).
- Known bugs pinned with `it.fails(...)`; flip to `it(...)` when fixed.
- Not covered here: real image codecs (`convertFrame`, `assembleGif`), UI components/hooks, anything visual.

Lint/format enforced by ESLint + Prettier via Husky pre-commit hook running `lint-staged`. Run `npm run prepare` once after clone to activate. Staged `ts`/`tsx` → `eslint --fix` + `prettier --write`; staged `js`/`json`/`css`/`md` → `prettier --write`.

## Environment Variables

Env files loaded in CRA priority order, injected at build via esbuild `define` as `__VAR__` constants.

Priority for `npm run build`: `.env.production.local` > `.env.local` > `.env.production` > `.env`
Priority for `npm run watch`: `.env.development.local` > `.env.local` > `.env.development` > `.env`

Committed (non-secret defaults): `.env`, `.env.production`, `.env.development`
Gitignored (local overrides): `.env.local`, `.env.*.local`

| Variable       | Where                                 | Purpose                                                                                                                  |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POSTHOG_KEY`  | `.env.production.local` (gitignored)  | Prod analytics key                                                                                                       |
| `POSTHOG_KEY`  | `.env.development.local` (gitignored) | Dev analytics key                                                                                                        |
| `POSTHOG_HOST` | `.env` (committed)                    | Analytics host; injected into `dist/manifest.json` → `networkAccess.allowedDomains`                                      |
| `PLUGIN_NAME`  | `.env` (committed)                    | Plugin display name in Figma; injected into `dist/manifest.json` → `name`                                                |
| `PLUGIN_ID`    | `.env` (committed)                    | Figma plugin ID; injected into `dist/manifest.json` → `id`                                                               |
| `LOG_SERVER`   | `.env.development` (committed)        | Dev log server URL (e.g. `http://localhost:3001`); injected as `__LOG_SERVER__`; added to `manifest.json` → `networkAccess.devAllowedDomains` |

Variable absent → empty string, analytics silently off.

### GitHub Actions Secrets

Gitignored vars needed in release builds come via GitHub environment secrets. Workflow uses `environment: production` — secrets in Settings → Environments → production. Workflow reads `${{ secrets.VAR_NAME }}`, passes as `env:` to build step.

| Secret        | Environment  | Purpose                                                  |
| ------------- | ------------ | -------------------------------------------------------- |
| `POSTHOG_KEY` | `production` | Analytics key — must match `.env.production.local` local |

New gitignored var needed in prod builds: add to `env:` block of `npm run build` step in `.github/workflows/release.yml` + add secret in Settings → Environments → production.

## Architecture

**Two-thread Figma plugin, full Feature-Sliced Design (strict layer order: `app → pages → widgets → features → entities → shared`):**

- `src/app/figma.ts` — code thread entry (Figma sandbox). Calls `figma.showUI`, registers feature handlers, listens to page-level Figma events (`currentpagechange`, `selectionchange`).
- `src/app/index.tsx` — UI thread entry (iframe, React/Preact-compat). Only `Root` + `render()` call. All UI logic in modules below.
- `src/shared/config/index.ts` — central config. All tunable constants (window size, section layout gaps/opacities, compression params, GIF settings, debounce delay, export scale, `FORMATS`). Imported in both threads as `import * as config from '../shared/config'`.

**Source structure:**

```
src/
  app/
    figma.ts                              code thread entry: showUI + register features + page events
    index.tsx                             UI thread entry: Root + render call + global CSS
  pages/
    export/ui/
      ExportPage.tsx                      export tab — screen state ('main'|'resize-limits'), calls useExport()
    organize/ui/
      OrganizePage.tsx                    place tab — listens for sections/selection messages
  widgets/
    resize-limits/ui/
      ResizeLimitsScreen.tsx              resize-limits sub-screen (tree/table view of per-frame limits)
      components/                         ViewToggleIcons, FrameRow, TableRow, TableHeader,
                                          TreeNodeView, ResizeLimitsButton, ResizeLimitsHeader
    platform-limits/ui/
      PlatformLimitsSection.tsx           per-format/platform limits section on the main export screen
      components/                         FormatRow, PlatformRow, GifDelayRow
    section-tree/ui/
      SectionTreePanel.tsx                "Add to section" panel (search + tree/table view toggle)
      components/                         SectionTree, SectionFormatNode, SectionChannelNode,
                                          SectionPlatformNode, CreativeRow,
                                          SectionTableHeader, SectionTableRow
  features/
    export-frames/
      api/
        index.ts                          code thread: export handlers (scan, rename, start-export,
                                          request-frame) + documentchange debounce; exportItems state
      model/
        useExport.ts                      custom hook: all export state, refs, effects, and handlers
      ui/
        SetupGuide.tsx                    empty-state setup instructions
    place-sections/
      api/
        index.ts                          code thread: place-frames + align-sections + get-sections handlers
      ui/components/                      SelectionIndicator, PlaceResultMessage, PathField, PathInput
  entities/
    frame/
      api/
        index.ts                          code thread: scanPage(), getSectionsHierarchy(), exportItems shared state
      model/
        types.ts                          FrameTree, ScanResult, ExportFrame and other shared types
        tree.ts                           FlatRow type, filterTree, flattenToRows, filterFlatRows, countFrames
  shared/
    ui/                                   TagBadge, NumInput, ProgressBar, ResizeHandle, TabBar, ComboboxDropdown,
                                          FlatTableHeader, FlatTableRow, SearchInput
    lib/
      figma.ts                            isSection, isFrame, isExportableNode, fitSectionToChildren, resizeSectionOnly, setSectionFill
      compression.ts                      pngBytesToCanvas, convertFrame, binary-search compression
      gif.ts                              assembleGif, GIF encoding via modern-gif (main thread, no worker)
      preview.ts                          escHtml, buildPreviewHtml
      declension.ts                       Russian noun declension helper
    types/
    config/
      index.ts                            all tunable constants + FORMATS
      strings.ts                          centralised string constants for all user-visible UI text
    analytics/
      index.ts                            PostHog analytics
    logger/
      index.ts                            dev-only log forwarder
```

**Messaging:** Both threads use `emit` / `on` from `@create-figma-plugin/utilities` (no raw `figma.ui.postMessage` / `parent.postMessage`). Message format = array `[name, ...args]` — never `{type: X, ...}` object. Each `on(name, handler)` returns unsubscribe fn; UI thread collects listeners, cleans in `useEffect` return: `const offs = [on(...), on(...)]; return () => offs.forEach(off => off())`.

**Initialization handshake:** `app/figma.ts` does NOT push `scan-result` on startup — UI iframe may not have listener yet (race). Instead UI calls `emit('scan')` from `useEffect` once listeners registered, code thread responds. Same pull pattern for `get-sections` in Place tab. Never revert to push-on-startup for initial data.

**Build pipeline (`scripts/build.js`):**

1. Cleans `dist/` fully before build — no stale artifacts.
2. esbuild bundles `src/app/figma.ts` → `dist/code.js` with full minification (`minify: true`).
3. Loads env files (CRA priority), injects `POSTHOG_*` vars and `LOG_SERVER` as `__VAR__` constants; also `__VERSION__` (from `git describe --tags --abbrev=0`, fallback `package.json`) and `__DEV__` (`true` in watch, `false` in prod)
5. esbuild bundles `src/app/index.tsx` in memory (`write: false`) with `minifyWhitespace: true` and `minifySyntax: true` — **not** `minifyIdentifiers`, since CSS module class names shortened per file independently → collisions (`.t`, `.n`, etc. defined multiple times) break styles. Entry key `ui` to keep output filename. JSX uses `preact/jsx-runtime`; React imports (`react`, `react-dom`, `react/jsx-runtime`) aliased to Preact equivalents so React components just work.
6. Reads JS and CSS from `result.outputFiles` (never on disk), builds HTML wrapper, minifies with `@minify-html/node` (HTML whitespace only; JS/CSS already minified by esbuild), writes `dist/ui.html`.
7. Calls `manifest.js(env)`, writes `dist/manifest.json` (injects `PLUGIN_NAME` → `name`, `POSTHOG_HOST` → `networkAccess.allowedDomains`, `LOG_SERVER` → `networkAccess.devAllowedDomains`)

**`scripts/watch.js`** also:

- Cleans `dist/` on startup — no stale artifacts.
- Writes `dist/manifest.json` on startup (dev env, includes `devAllowedDomains`)
- Watches `manifest.js`, regenerates `dist/manifest.json` immediately on change
- UI bundle also `write: false`; `write-html` esbuild plugin reads JS/CSS from `result.outputFiles`, writes `dist/ui.html` every rebuild (no intermediate `ui.js`/`ui.css` on disk in watch either).
- Auto-starts `scripts/log-server.js` if `LOG_SERVER` set; watches it, hot-reloads on save

**`manifest.js`** at project root = manifest source of truth — exports factory `(env) => ({...})`. Don't edit `dist/manifest.json` directly.

## Dev Logging (`src/shared/logger/index.ts`)

`src/shared/logger/index.ts` = dev-only logging module, imported by `src/features/export-frames/model/useExport.ts` and `src/pages/export/ui/ExportPage.tsx`. Prod (`__DEV__ = false`): all network sends no-op.

Exports: `log`, `warn`, `error`, `info` (thread `ui`). `fromCodeThread` defined but not wired by default (code thread emits no `log` events).

At module load in dev, also:

- Overrides `console.warn` and `console.error` → forwards output to server as thread `figma`
- Patches `HTMLCanvasElement.prototype.getContext` to add `{ willReadFrequently: true }` for all `'2d'` contexts (suppresses browser perf warnings)

**Log server** (`scripts/log-server.js`): HTTP server port 3001, routes entries to:

- `logs/ui.log` — threads `ui` and `code`
- `logs/figma.log` — thread `figma`

Auto-started by `npm run watch` when `LOG_SERVER` set; hot-reloads on own file change (managed by `watch.js`).

## Expected Figma Page Structure

Plugin scans `figma.currentPage` for 4-level nested section hierarchy:

```
Format section (JPG/PNG/WEBP/GIF)
  └─ Channel section
       └─ Platform section
            └─ Creative section
                 └─ Frame(s)
```

GIF: frames at same Y grouped into one animation, sorted left→right by X. Output filenames `{width}x{height}.{ext}`, deduped with `_2`, `_3` suffixes.

## Compression Strategy

All formats apply Floyd-Steinberg / Bayer / Jarvis-Judice-Ninke dithering (shared `src/shared/lib/dither.ts`, generic `QuantizeFn` callback). Active algorithm set by `DITHER_METHOD` in `shared/config/index.ts` (`'best'` | `'floyd-steinberg'` | `'bayer'` | `'jarvis-judice-ninke'`).

- **JPG/WebP**: binary search over quality (0.0–1.0). Dithering as pre-processing (uniform channel quantisation at `JPG_DITHER_LEVELS`). `JPG_DITHER_CANDIDATES=true` tries original + dithered, keeps largest blob ≤ limit; `false` always dithers directly. Chosen method logged in dev.
- **PNG**: binary search over quantisation levels (2–256), dithering during quantisation. `PNG_DITHER_CANDIDATES=true` tries all methods, keeps highest levels; `false` uses `DITHER_METHOD` directly. Chosen method + levels logged in dev.
- **GIF**: binary search over `maxColors` (2–255). Palette via `modern-palette`, frames pre-dithered, passed to `modern-gif` (pixels already match palette → `findNearestIndex` hits exact). `GIF_DITHER_CANDIDATES=true` tries all methods, keeps highest `maxColors`; `false` uses `DITHER_METHOD` directly. No limit → JJN at `maxColors=255`. Chosen method logged in dev.

Frames processed sequentially (one at a time) to not overload Figma plugin bridge.

## UI Features

### Export tab

- **Resizes screen**: per-frame size limits on dedicated sub-screen `ResizeLimitsScreen` (`src/widgets/resize-limits/ui/ResizeLimitsScreen.tsx`), opened via "Resizes" button on main export screen. Button shows total frame count. Sub-screen has fixed header (`ResizeLimitsHeader`): back arrow (`←`), title, tree/table toggle (icon buttons), search input pinned below title row. `screen` state (`'main' | 'resize-limits'`) in `ExportPage`. `resizeLimitsView` state (`'tree' | 'table'`) in `useExport`.
- **Tree view** (`resizeLimitsView === 'tree'`): collapsible format/channel/platform/creative nodes; sticky format headers; all expanded by default (`defaultExpanded={true}`). Rendered via `TreeNodeView` + `FrameRow`.
- **Table view** (`resizeLimitsView === 'table'`): flat list of all frames via `TableRow` using shared `FlatTableRow` layout. Sticky header `TableHeader` wraps `FlatTableHeader` with extra "Ресайз" column (frame name + optional GIF frame count) and "Лимит" column. Columns: Формат | Канал | Площадка | Креатив | Ресайз | Лимит. Data: `flattenToRows(tree)` → `filterFlatRows(rows, search)`. `FlatRow` interface holds `key`, `formatTag`, `channel`, `platform`, `creative`, `frameName`, `gifFrameInfo`.
- **Per-frame size limits**: `FrameRow` (tree) and `TableRow` (table) — hover highlight (`--figma-color-bg-hover`), click-to-focus limit input (via `containerRef` + `querySelector('input')`)
- **Per-platform size limits**: global limits per format+platform, stored in `platformSizes` as `"${format}/${platformName}"` keys. Each platform row = `PlatformRow` with hover + click-to-focus.
- **Per-format size limits**: default limit for all platforms of a format, stored in `platformSizes` as `"${format}"` key (no platform suffix). Rendered by `FormatRow`. Priority in `getLimit`: per-frame > per-platform > per-format.
- **GIF delay row**: `GifDelayRow` — full-width hover, click-to-focus input.
- **Numeric inputs** (`NumInput`, `FrameRow`, `TableRow`, `FormatRow`, `PlatformRow`, `GifDelayRow`): use `TextboxNumeric` from `@create-figma-plugin/ui` with `variant="border"` and `validateOnBlur`. `NumInput` (`src/shared/ui/NumInput.tsx`) wraps `TextboxNumeric`, accepts `containerRef` so callers focus inner input via `containerRef.current?.querySelector('input')?.focus()`. Optional `suffix` prop (e.g. `"МБ"`, `"сек"`) rendered as absolutely positioned label overlay (`z-index: 3`) inside wrapper div, styled like native Figma color-input `%` label — **not** passed to `TextboxNumeric`. `.num-input-suffix` CSS class shrinks inner input right padding so text doesn't overlap suffix. Don't replace with native `<input type="number">`.
- **Text inputs** (`PathField`): `Textbox` from `@create-figma-plugin/ui` with `variant="border"` and `onValueInput` callback.
- **Path input** (`PathInput`): `SearchTextbox` from `@create-figma-plugin/ui` with `clearOnEscapeKeyDown`. Search icon hidden via `.path-input-wrap` CSS class injected in `Root`.
- **Search/filter**: search input in fixed header of Resizes screen (not scroll area). Tree mode filters via `filterTree`; table mode via `filterFlatRows`.
- **Path mode**: segmented control to include/strip format folder from ZIP paths
- **GIF delay**: configurable frame delay (seconds)
- **Preview HTML**: after export, downloads self-contained HTML for visual review. All Figma node names and file paths HTML-escaped via `escHtml()` (`src/shared/lib/preview.ts`) before insertion — prevents XSS.
- **Hover/active states**: via CSS classes injected in `Root`'s `<style>` tag (in `src/app/index.tsx`). Classes + rules:
  - `.tab-btn` / `.tab-active` — tab bar buttons; hover/active only when `.tab-active` absent
  - `.btn-icon` / `.btn-active` — small icon buttons; hover/active skipped when `.btn-active` present
  - `.segmented_control_segmentedControl label:not(:has(.segmented_control_input:checked))` — hover/active skipped for selected segment
  - `.link-text` — clickable spans (Отмена, Очистить экспорт, Выровнять секции); opacity change
  - `.back-row` — full-width clickable area in Resizes sub-screen header (arrow + title); toggle buttons sit above via `position: absolute` with `stopPropagation`
  - `.tree-header` — collapsible node headers in both tree views
  - `.limit-row` — rows in "Лимиты по площадкам" and GIF delay row; full-width via `margin: 0 -N px` where needed
  - `.num-input-suffix` — wrapper div around `TextboxNumeric` when suffix present; shrinks input right padding so suffix overlay doesn't overlap value
  - `.path-input-wrap` — wrapper div around `SearchTextbox` in `PathInput`; hides search icon so field looks like plain text input
  - `.path-field-input` — wrapper div around `Textbox` inputs in "По полям" mode; input height → `var(--space-32)`
  - Resizes nav button uses `useState` (not CSS class) since inline `background` overrides CSS `:hover`
  - Sticky format headers in tree use `useState` for same reason
  - Sticky table headers (`FlatTableHeader`) use `z-index: 10`
- **Resize handle**: drag bottom-right corner to resize plugin window
- **Layout**: `Root` = flex column filling 100% of iframe (`html, body, #create-figma-plugin { height: 100%; overflow: hidden }`). Tab bar on top; tab content fills rest.
- **Export tab scroll**: content area (`flex: 1, overflow-y: auto`) scrolls independently. Bottom action bar (export button / progress / download) = normal flow element pinned at bottom of flex column — not `position: fixed`. Scrollbar track never overlaps button zone.
- **Organize tab scroll**: whole tab container scrolls (`overflow-y: auto`) on overflow; section tree has own inner scroll (`max-height: 220px, overflow-y: auto`).
- **Bottom action bar**: Export button (phase `ready`), progress + cancel (phase `exporting`), Download + "Очистить экспорт" (phase `done`). Button padding overridden via injected `<style>` targeting `.export-btn-wrap` (`Button` from `@create-figma-plugin/ui` has no padding prop).
- **Progress bar**: only during export (`phase === 'exporting'`); hidden after. No "Done" status text.
- **Download button label**: ZIP size + file count — e.g. `Скачать ZIP · 2.34 МБ · 42 файла`. Partial export (by format or platform) → label includes filter — e.g. `Скачать ZIP JPG · …` or `Скачать ZIP VK · …`.

### Place tab (Разместить)

Three input modes via segmented control:

- **По полям** (`'fields'`): separate `PathField` inputs for Format, Channel, Platform, Creative with autocomplete dropdowns. Height increased via `.path-field-input` CSS class.
- **Путь** (`'path'`): single `PathInput` with slash-separated path, segment-aware autocomplete. `SearchTextbox` with built-in clear button; search icon hidden via `.path-input-wrap` CSS class.
- **Секции** (`'sections'`): full-screen `SectionTreePanel` fills remaining tab height (`flex: 1`). Shows existing sections with search input + tree/table toggle. Platform nodes collapsible (same style as channel nodes). Bottom action bar and "Поместить" button hidden here; placement via per-creative `+` buttons in panel. Warning bar at bottom when no frames selected.

Common behaviours:

- Missing sections created; frames appended to existing creative sections (stacked vertically, horizontally for GIF slides).
- **New section positioning**: new siblings placed after existing (channels/platforms stack vertically; creatives stack horizontally within platform).
- **New format section positioning**: other format sections exist → new one placed `FORMAT_SECTION_GAP` px right of rightmost; none exist → placed at absolute position of selected frames and auto-selected in Figma.
- **Section fitting** (`fitSectionToChildren` in `src/shared/lib/figma.ts`): local coordinates — shifts section origin so content has `padding` on all sides, compensates children local positions to keep absolute positions, then resizes. Local coords (not `absoluteBoundingBox`) avoid stale values after `appendChild`. Default padding `SECTION_FIT_PADDING` (see `shared/config/index.ts`).
- **`SelectionIndicator`** renders only "Выровнять секции" link — no longer accepts/displays `selectedCount`.
- **Align sections** (`align-sections` handler): before fitting each creative section, all exportable nodes (FRAME, COMPONENT, INSTANCE) inside renamed to `{width}x{height}` — same renaming as export start. Width/height rounded with `Math.round` to avoid Figma float artefacts (e.g. `240.00001525878906` → `240`).

## Analytics (`src/shared/analytics/index.ts`)

PostHog EU, fire-and-forget via fetch. Key and host injected at build — not hardcoded.

**Note:** Figma plugin UI runs in `data:` URL iframe — `localStorage` blocked. `distinct_id` = session-scoped random ID (regenerated each plugin open).

Every event includes `version` (git tag, e.g. `v1.3.0`). Dev mode (`__DEV__ = true`): events also include `$set: { is_test_user: true }` for PostHog filtering.

Tracked events: `plugin_opened`, `export_started`, `export_completed`, `export_cancelled`, `export_error`, `frames_placed`.

## Releases

Releases auto-created via GitHub Actions (`.github/workflows/release.yml`) on version tag push:

```bash
git tag v1.2
git push origin v1.2
```

Workflow builds plugin, attaches ZIP (`dist/`) to GitHub release. No manual releases.

**Release notes** cover only user-visible or security-relevant changes: new UI features, changed behaviour, noticeable bug fixes, security fixes. Skip internal tooling, dependency upgrades, build pipeline, CI/CD fixes unless they directly affect user-facing product.

## Key Dependencies

- `jszip` — ZIP assembly in browser
- `modern-gif` — GIF encoding on main thread (no Web Worker; Figma sandbox CSP blocks Blob-URL workers)
- `preact` — UI framework (via React-compat alias so components use React imports)
- `@create-figma-plugin/ui` v4 — Figma-styled UI components (tracks current Figma design system). Used: `Button`, `Text`, `Muted`, `VerticalSpace`, `Textbox`, `SearchTextbox`, `TextboxNumeric`, `SegmentedControl`, `render`. All inputs `variant="border"`. `render(Component)(rootEl, props)` mounts UI.
- `@create-figma-plugin/utilities` v4 — `emit`/`on` (type-safe cross-thread messaging, `[name, ...args]` array format). Used in code thread modules and `app/index.tsx`. **Do NOT use `showUI` from utilities** — wraps `__html__` in `<script>` tag, breaks because Figma gives `__html__` as full HTML document. Use `figma.showUI(__html__, options)` directly in `app/figma.ts`.
- `@figma/plugin-typings` — TS types for Figma Plugin API
- `esbuild` — bundler
- `@minify-html/node` — minifies HTML wrapper in `dist/ui.html` (devDependency; only in `scripts/build.js`)
- `eslint-plugin-jsdoc` — enforces JSDoc presence/structure (`jsdoc/require-jsdoc`, `jsdoc/require-param`, `jsdoc/require-returns`, `jsdoc/require-description`)

## TypeScript / IDE Notes

- `tsconfig.json` uses `"moduleResolution": "bundler"` — needed for VS Code to resolve modern packages (preact, jszip, etc.) using `exports` field in `package.json`. Don't change to `node`.
- `Uint8Array` from Figma plugin bridge typed `Uint8Array<ArrayBufferLike>`, not directly assignable to `BlobPart`. Cast `as BlobPart` where needed (e.g. `new Blob([bytes as BlobPart])`).
- After clone, run `npm run prepare` to install Husky pre-commit hook (runs `lint-staged` on commit).
- `@types/node` (devDependency) required since `vitest.config.mts` imports `node:fs` (else TS2591). Node types also leak into `src/` type-checking via jszip's `/// <reference types="node" />`, so restricting `types` in `tsconfig.json` can't scope them away — don't rely on Node globals being absent in `src/`.