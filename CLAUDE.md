# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

### Function Comments

All functions must have comments. Use JSDoc (`/** ... */`) for all public functions, hooks, and utilities. Explain non-obvious logic inside functions with inline comments (`//`).

Reference: https://jsdoc.app

### Variable Naming

Variable and function names must be readable and descriptive. Avoid abbreviations like `cb`, `fn`, `v`, `tmp`.

- Functions and variables: `camelCase`
- React/Preact components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`

References: [Airbnb Style Guide](https://github.com/airbnb/javascript), [TypeScript Style Guide](https://basarat.gitbook.io/typescript/styleguide)

## Commit Messages

All commit messages must be in English.

## What This Is

A Figma plugin ("Export Prod") for batch-exporting frames as JPG, PNG, WebP, or GIF with per-platform/per-frame file size limits, packaged into a ZIP download. UI labels are in Russian.

## Build Commands

```bash
npm run build     # Full build: app/figma.ts + app/index.tsx → dist/ (NODE_ENV=production)
npm run watch     # Watch mode: rebuilds both app/figma.ts and app/index.tsx on changes (NODE_ENV=development)
```

Linting and formatting are enforced via ESLint + Prettier through a Husky pre-commit hook that runs `lint-staged`. Run `npm run prepare` once after cloning to activate the hook. Staged `ts`/`tsx` files run `eslint --fix` + `prettier --write`; staged `js`/`json`/`css`/`md` files run `prettier --write`.

## Environment Variables

Env files are loaded in CRA priority order and injected at build time via esbuild `define` as `__VAR__` constants.

Priority for `npm run build`: `.env.production.local` > `.env.local` > `.env.production` > `.env`
Priority for `npm run watch`: `.env.development.local` > `.env.local` > `.env.development` > `.env`

Committed (non-secret defaults): `.env`, `.env.production`, `.env.development`
Gitignored (local overrides): `.env.local`, `.env.*.local`

| Variable       | Where                                 | Purpose                                                                                                                                       |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTHOG_KEY`  | `.env.production.local` (gitignored)  | Analytics key for production                                                                                                                  |
| `POSTHOG_KEY`  | `.env.development.local` (gitignored) | Analytics key for development                                                                                                                 |
| `POSTHOG_HOST` | `.env` (committed)                    | Analytics host; injected into `dist/manifest.json` → `networkAccess.allowedDomains`                                                           |
| `PLUGIN_NAME`  | `.env` (committed)                    | Plugin display name in Figma; injected into `dist/manifest.json` → `name`                                                                     |
| `PLUGIN_ID`    | `.env` (committed)                    | Figma plugin ID; injected into `dist/manifest.json` → `id`                                                                                    |
| `LOG_SERVER`   | `.env.development` (committed)        | Dev log server URL (e.g. `http://localhost:3001`); injected as `__LOG_SERVER__`; added to `manifest.json` → `networkAccess.devAllowedDomains` |

If a variable is absent, it defaults to an empty string and analytics are silently disabled.

### GitHub Actions Secrets

Gitignored variables that must be present in release builds are passed via GitHub environment secrets. The workflow uses `environment: production` — secrets live in Settings → Environments → production. The workflow reads them as `${{ secrets.VAR_NAME }}` and passes them as `env:` to the build step.

| Secret        | Environment  | Purpose                                                    |
| ------------- | ------------ | ---------------------------------------------------------- |
| `POSTHOG_KEY` | `production` | Analytics key — must match `.env.production.local` locally |

When adding a new gitignored variable that should be present in production builds: add it to the `env:` block of the `npm run build` step in `.github/workflows/release.yml` and add the corresponding secret in Settings → Environments → production.

## Architecture

**Two-thread Figma plugin model with full Feature-Sliced Design (strict layer order: `app → pages → widgets → features → entities → shared`):**

- `src/app/figma.ts` — Code thread entry point (Figma sandbox). Calls `figma.showUI`, registers feature handlers, and listens to page-level Figma events (`currentpagechange`, `selectionchange`).
- `src/app/index.tsx` — UI thread entry point (iframe, React/Preact-compat). Contains only `Root` and the `render()` call. All UI logic lives in the modules below.
- `src/shared/config/index.ts` — Central config module. All tunable constants (window size, section layout gaps and opacities, compression parameters, GIF settings, debounce delay, export scale, `FORMATS`). Imported in both threads as `import * as config from '../shared/config'`.

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
      figma.ts                            isSection, isFrame, fitSectionToChildren, resizeSectionOnly, setSectionFill
      compression.ts                      pngBytesToCanvas, convertFrame, binary-search compression
      gif.ts                              assembleGif, GIF worker URL (declares __GIF_WORKER_CONTENT__)
      preview.ts                          escHtml, buildPreviewHtml
      declension.ts                       Russian noun declension helper
    types/
      gif.d.ts                            ambient type declaration for gif.js npm package
    config/
      index.ts                            all tunable constants + FORMATS
      strings.ts                          centralised string constants for all user-visible UI text
    analytics/
      index.ts                            PostHog analytics
    logger/
      index.ts                            dev-only log forwarder
```

**Messaging:** Both threads use `emit` / `on` from `@create-figma-plugin/utilities` (no raw `figma.ui.postMessage` / `parent.postMessage`). Message format is an array `[name, ...args]` — never a `{type: X, ...}` object. Each `on(name, handler)` returns an unsubscribe function; in the UI thread, multiple listeners are collected and cleaned up in `useEffect` return: `const offs = [on(...), on(...)]; return () => offs.forEach(off => off())`.

**Initialization handshake:** `app/figma.ts` does NOT push `scan-result` on startup — the UI iframe may not have registered its message listener yet (race condition). Instead, the UI calls `emit('scan')` from its `useEffect` once listeners are registered, and the code thread responds. The same pull pattern applies to `get-sections` in the Place tab. Never switch back to push-on-startup for initial data.

**Build pipeline (`scripts/build.js`):**

1. Cleans `dist/` entirely before building to avoid stale artifacts.
2. esbuild bundles `src/app/figma.ts` → `dist/code.js` with full minification (`minify: true`).
3. Reads `gif.worker.js` from `node_modules/gif.js/dist/` and passes its content to esbuild via `define` as `__GIF_WORKER_CONTENT__` (lazily initialized in the UI via `URL.createObjectURL`)
4. Loads env files (CRA priority order), injects `POSTHOG_*` vars and `LOG_SERVER` as `__VAR__` constants; also injects `__VERSION__` (from `git describe --tags --abbrev=0`, fallback to `package.json`) and `__DEV__` (`true` in watch mode, `false` in production)
5. esbuild bundles `src/app/index.tsx` in memory (`write: false`) with `minifyWhitespace: true` and `minifySyntax: true` — but **not** `minifyIdentifiers`, because CSS module class names are shortened independently per file, causing collisions (`.t`, `.n`, etc. end up defined multiple times) that break styles. Entry key is named `ui` to preserve output filename. JSX uses `preact/jsx-runtime`; React imports (`react`, `react-dom`, `react/jsx-runtime`) are aliased to their Preact equivalents so React components work out of the box.
6. Reads JS and CSS from `result.outputFiles` (never written to disk), assembles the HTML wrapper, minifies it with `@minify-html/node` (HTML-level whitespace only; JS and CSS are already minified by esbuild), and writes `dist/ui.html`.
7. Calls `manifest.js(env)` and writes the result to `dist/manifest.json` (injects `PLUGIN_NAME` → `name`, `POSTHOG_HOST` → `networkAccess.allowedDomains`, `LOG_SERVER` → `networkAccess.devAllowedDomains`)

**`scripts/watch.js`** additionally:

- Cleans `dist/` on startup to avoid stale artifacts.
- Writes `dist/manifest.json` on startup (dev env, includes `devAllowedDomains`)
- Watches `manifest.js` for changes and regenerates `dist/manifest.json` immediately
- UI bundle also uses `write: false`; the `write-html` esbuild plugin reads JS and CSS from `result.outputFiles` and writes `dist/ui.html` on every rebuild (no intermediate `ui.js`/`ui.css` on disk in watch mode either).
- Auto-starts `scripts/log-server.js` if `LOG_SERVER` is set; watches it for changes and hot-reloads on save

**`manifest.js`** at the project root is the source of truth for the manifest — it exports a factory `(env) => ({...})`. Do not edit `dist/manifest.json` directly.

## Dev Logging (`src/shared/logger/index.ts`)

`src/shared/logger/index.ts` is the dev-only logging module imported by `src/features/export-frames/model/useExport.ts` and `src/pages/export/ui/ExportPage.tsx`. In production (`__DEV__ = false`) all network sends are no-ops.

Exports: `log`, `warn`, `error`, `info` (thread `ui`). `fromCodeThread` is defined but not wired by default (the code thread does not emit `log` events).

At module load time in dev mode, it also:

- Overrides `console.warn` and `console.error` to forward captured output to the server as thread `figma`
- Patches `HTMLCanvasElement.prototype.getContext` to add `{ willReadFrequently: true }` for all `'2d'` contexts (suppresses the gif.js browser warning)

**Log server** (`scripts/log-server.js`): HTTP server on port 3001, routes entries to:

- `logs/ui.log` — threads `ui` and `code`
- `logs/figma.log` — thread `figma`

Started automatically by `npm run watch` when `LOG_SERVER` is set; hot-reloads when its own file changes (managed by `watch.js`).

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

## UI Features

### Export tab

- **Resizes screen**: per-frame size limits live on a dedicated sub-screen rendered by `ResizeLimitsScreen` (`src/widgets/resize-limits/ui/ResizeLimitsScreen.tsx`), opened via the "Resizes" button on the main export screen. The button shows the total frame count. The sub-screen has a fixed header (`ResizeLimitsHeader`) with a back arrow (`←`), the title, a tree/table view toggle (icon buttons), and a search input pinned below the title row. `screen` state (`'main' | 'resize-limits'`) lives in `ExportPage`. `resizeLimitsView` state (`'tree' | 'table'`) lives in `useExport`.
- **Tree view** (`resizeLimitsView === 'tree'`): collapsible format/channel/platform/creative nodes; sticky format headers; all nodes expanded by default (`defaultExpanded={true}`). Rendered via `TreeNodeView` + `FrameRow`.
- **Table view** (`resizeLimitsView === 'table'`): flat list of all frames rendered by `TableRow` using the shared `FlatTableRow` layout. The sticky header is `TableHeader`, which wraps `FlatTableHeader` with an extra "Ресайз" column (frame name + optional GIF frame count) and a "Лимит" column. Columns: Формат | Канал | Площадка | Креатив | Ресайз | Лимит. Data comes from `flattenToRows(tree)` → `filterFlatRows(rows, search)`. `FlatRow` interface holds `key`, `formatTag`, `channel`, `platform`, `creative`, `frameName`, `gifFrameInfo`.
- **Per-frame size limits**: `FrameRow` (tree) and `TableRow` (table) components — hover highlight (`--figma-color-bg-hover`), click-to-focus on limit input (via `containerRef` + `querySelector('input')`)
- **Per-platform size limits**: global limits per format+platform combination, stored in `platformSizes` as `"${format}/${platformName}"` keys. Each platform row is a `PlatformRow` component with hover + click-to-focus.
- **Per-format size limits**: default limit for all platforms of a given format, stored in `platformSizes` as `"${format}"` key (no platform suffix). Rendered by `FormatRow` component. Priority in `getLimit`: per-frame > per-platform > per-format.
- **GIF delay row**: `GifDelayRow` component — full-width hover, click-to-focus on the input.
- **Numeric inputs** (`NumInput`, `FrameRow`, `TableRow`, `FormatRow`, `PlatformRow`, `GifDelayRow`): use `TextboxNumeric` from `@create-figma-plugin/ui` with `variant="border"` and `validateOnBlur`. `NumInput` (`src/shared/ui/NumInput.tsx`) wraps `TextboxNumeric` and accepts a `containerRef` so callers can focus the inner input via `containerRef.current?.querySelector('input')?.focus()`. The optional `suffix` prop (e.g. `"МБ"`, `"сек"`) is rendered as an absolutely positioned label overlay (`z-index: 3`) inside the wrapper div, styled to match the native Figma color-input `%` label — it is **not** passed to `TextboxNumeric`. The `.num-input-suffix` CSS class shrinks the inner input's right padding to avoid text overlapping the suffix. Do not replace with native `<input type="number">`.
- **Text inputs** (`PathField`): use `Textbox` from `@create-figma-plugin/ui` with `variant="border"` and `onValueInput` callback.
- **Path input** (`PathInput`): uses `SearchTextbox` from `@create-figma-plugin/ui` with `clearOnEscapeKeyDown`. The search icon is visually hidden via the `.path-input-wrap` CSS class injected in `Root`.
- **Search/filter**: search input is in the fixed header of the Resizes screen (not in the scroll area). In tree mode it filters via `filterTree`; in table mode via `filterFlatRows`.
- **Path mode**: segmented control to include or strip the format folder from ZIP paths
- **GIF delay**: configurable frame delay (seconds)
- **Preview HTML**: after export, downloads a self-contained HTML file for visual review. All Figma node names and file paths are HTML-escaped via `escHtml()` (`src/shared/lib/preview.ts`) before insertion to prevent XSS.
- **Hover/active states**: controlled via CSS classes injected in `Root`'s `<style>` tag (in `src/app/index.tsx`). Classes and their rules:
  - `.tab-btn` / `.tab-active` — tab bar buttons; hover/active only applies when `.tab-active` is absent
  - `.btn-icon` / `.btn-active` — small icon buttons; hover/active skipped when `.btn-active` is present
  - `.segmented_control_segmentedControl label:not(:has(.segmented_control_input:checked))` — hover/active skipped for the selected segment
  - `.link-text` — clickable spans (Отмена, Очистить экспорт, Выровнять секции); uses opacity change
  - `.back-row` — full-width clickable area in the Resizes sub-screen header (arrow + title); toggle buttons sit above it via `position: absolute` with `stopPropagation`
  - `.tree-header` — collapsible node headers in both tree views
  - `.limit-row` — rows in "Лимиты по площадкам" and the GIF delay row; full-width via `margin: 0 -N px` where needed
  - `.num-input-suffix` — wrapper div around `TextboxNumeric` when a suffix is present; shrinks input right padding so the suffix overlay does not overlap the typed value
  - `.path-input-wrap` — wrapper div around `SearchTextbox` in `PathInput`; hides the search icon via CSS so the field looks like a plain text input
  - `.path-field-input` — wrapper div around `Textbox` inputs in "По полям" mode; increases input height to `var(--space-32)`
  - Resizes nav button uses `useState` (not CSS class) because its inline `background` would override CSS `:hover`
  - Sticky format headers in tree use `useState` for the same reason
  - Sticky table headers (`FlatTableHeader`) use `z-index: 10`
- **Resize handle**: drag bottom-right corner to resize the plugin window
- **Layout**: `Root` is a flex column filling 100% of the iframe (`html, body, #create-figma-plugin { height: 100%; overflow: hidden }`). The tab bar sits at the top; each tab content fills the remaining height.
- **Export tab scroll**: the content area (`flex: 1, overflow-y: auto`) scrolls independently. The bottom action bar (export button / progress / download) is a normal flow element pinned at the bottom of the flex column — not `position: fixed`. The scrollbar track never overlaps the button zone.
- **Organize tab scroll**: the whole tab container scrolls (`overflow-y: auto`) if content overflows; the section tree has its own inner scroll (`max-height: 220px, overflow-y: auto`).
- **Bottom action bar**: Export button (phase `ready`), progress + cancel (phase `exporting`), and Download + "Очистить экспорт" (phase `done`). Button padding is overridden via an injected `<style>` tag targeting the `.export-btn-wrap` class (the `Button` component from `@create-figma-plugin/ui` does not accept a padding prop).
- **Progress bar**: shown only during export (`phase === 'exporting'`); hidden after completion. No "Done" status text is shown.
- **Download button label**: shows the ZIP size and file count — e.g. `Скачать ZIP · 2.34 МБ · 42 файла`. If a partial export was run (by format or platform), the label also includes the filter — e.g. `Скачать ZIP JPG · …` or `Скачать ZIP VK · …`.

### Place tab (Разместить)

The Place tab has three input modes selected via a segmented control:

- **По полям** (`'fields'`): separate `PathField` inputs for Format, Channel, Platform, Creative with autocomplete dropdowns. Input height increased via `.path-field-input` CSS class.
- **Путь** (`'path'`): single `PathInput` with slash-separated path and segment-aware autocomplete. Uses `SearchTextbox` with a built-in clear button; the search icon is hidden via `.path-input-wrap` CSS class.
- **Секции** (`'sections'`): full-screen `SectionTreePanel` fills the remaining tab height (`flex: 1`). Shows existing sections with a search input and tree/table view toggle. Platform nodes are collapsible (same style as channel nodes). The bottom action bar and "Поместить" button are hidden in this mode; placement is done via per-creative `+` buttons in the panel. A warning bar is shown at the bottom when no frames are selected.

Common behaviours:

- Sections are created if they don't exist; frames are appended to existing creative sections (stacked vertically, or horizontally for GIF slides).
- **New section positioning**: new siblings are placed after existing ones (channels/platforms stack vertically; creatives stack horizontally within a platform).
- **New format section positioning**: if other format sections already exist on the page, the new one is placed `FORMAT_SECTION_GAP` px to the right of the rightmost; if no format sections exist yet, it is placed at the absolute position of the selected frames and automatically selected in Figma.
- **Section fitting** (`fitSectionToChildren` in `src/shared/lib/figma.ts`): works in local coordinates — shifts the section origin so content has `padding` space on all sides, compensates children's local positions to keep their absolute positions unchanged, then resizes. Uses local coords (not `absoluteBoundingBox`) to avoid stale values after `appendChild`. Default padding is `SECTION_FIT_PADDING` (see `shared/config/index.ts`).
- **`SelectionIndicator`** renders only the "Выровнять секции" link — it no longer accepts or displays `selectedCount`.

## Analytics (`src/shared/analytics/index.ts`)

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
- `preact` — UI framework (used via React-compat alias so components can use React imports)
- `@create-figma-plugin/ui` v4 — Figma-styled UI components (tracks current Figma design system). Used components: `Button`, `Text`, `Muted`, `VerticalSpace`, `Textbox`, `SearchTextbox`, `TextboxNumeric`, `SegmentedControl`, `render`. All inputs use `variant="border"`. `render(Component)(rootEl, props)` mounts the UI.
- `@create-figma-plugin/utilities` v4 — `emit`/`on` (type-safe cross-thread messaging using `[name, ...args]` array format). Used in both code thread modules and `app/index.tsx`. **Do NOT use `showUI` from utilities** — it wraps `__html__` inside a `<script>` tag, which breaks because Figma provides `__html__` as a full HTML document. Use `figma.showUI(__html__, options)` directly in `app/figma.ts` instead.
- `@figma/plugin-typings` — TypeScript types for Figma Plugin API
- `esbuild` — Bundler
- `@minify-html/node` — minifies the HTML wrapper in `dist/ui.html` (devDependency; used only in `scripts/build.js`)
- `eslint-plugin-jsdoc` — ESLint plugin that enforces JSDoc presence and structure (`jsdoc/require-jsdoc`, `jsdoc/require-param`, `jsdoc/require-returns`, `jsdoc/require-description`)

## TypeScript / IDE Notes

- `tsconfig.json` uses `"moduleResolution": "bundler"` — required for VS Code to resolve modern packages (preact, jszip, etc.) that use the `exports` field in `package.json`. Do not change this to `node`.
- `Uint8Array` received from the Figma plugin bridge has type `Uint8Array<ArrayBufferLike>`, which is not directly assignable to `BlobPart`. Cast with `as BlobPart` where needed (e.g. `new Blob([bytes as BlobPart])`).
- After cloning, run `npm run prepare` to install the Husky pre-commit hook (runs `lint-staged` on commit).
