# Export Prod

[RU](#ru) | [EN](#en)

---

## EN

A Figma plugin for batch exporting frames as JPG, PNG, WebP, or GIF with file size limits. Results are packaged into a ZIP archive.

### Installation

Download the latest release from [Releases](https://github.com/a-lagutov/export-prod/releases) and unzip it.

In Figma: **Plugins → Development → Import plugin from manifest** → select the `manifest.json` file from the `ADV-Export-Prod` folder.

### Development

```bash
npm run watch   # Watch mode: rebuilds app/figma.ts + app/index.tsx on changes (NODE_ENV=development)
npm run build   # Full build (app/figma.ts + app/index.tsx → dist/, NODE_ENV=production)
```

#### Environment variables

Env files follow CRA priority order and are injected at build time.

| Variable       | File                                  | Purpose                                                                                                    |
| -------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POSTHOG_KEY`  | `.env.production.local` (gitignored)  | Analytics key for production                                                                               |
| `POSTHOG_KEY`  | `.env.development.local` (gitignored) | Analytics key for development (events marked `is_test_user: true`)                                         |
| `POSTHOG_HOST` | `.env`                                | Analytics host; also sets `networkAccess.allowedDomains` in `dist/manifest.json`                           |
| `PLUGIN_NAME`  | `.env`                                | Plugin display name in Figma; sets `name` in `dist/manifest.json`                                          |
| `PLUGIN_ID`    | `.env`                                | Figma plugin ID; sets `id` in `dist/manifest.json`                                                         |
| `LOG_SERVER`   | `.env.development`                    | Dev log server URL (`http://localhost:3001`); added to `manifest.json` → `networkAccess.devAllowedDomains` |

Create `.env.production.local` (and optionally `.env.development.local`) with your PostHog key:

```
POSTHOG_KEY=phc_...
```

#### Dev logging

`npm run watch` automatically starts a local HTTP log server (port 3001) when `LOG_SERVER` is set. Logs are written to:

- `logs/ui.log` — structured logs from the plugin UI and main threads
- `logs/figma.log` — captured `console.warn` / `console.error` from the Figma iframe

Changes to `scripts/log-server.js` are applied immediately without restarting `npm run watch`.

### Figma Page Structure

The plugin scans the current page and looks for 4 levels of nested sections:

```
Format (JPG / PNG / WEBP / GIF)
  └─ Channel (e.g., 5_Context_Media)
       └─ Platform (e.g., VK, TG, Bigo)
            └─ Creative (e.g., 1234-card)
                 └─ Frame(s) / Component instance(s)
```

Format section names must exactly match the format name (case-insensitive).

#### Creative Naming

```
xxxx-yyy
```

- `xxxx` — task number in Jira
- `yyy` — creative identifier

Multiple words in a name are separated by dots:

```
1234-card
1234-yellow.card
1234-black.friday
```

#### GIF

Frames within a creative are grouped into animations by Y-position (frames on the same horizontal line = one GIF animation). Frames are sorted left-to-right by X.

### Placing Frames (Place Tab)

The **Place** tab lets you organize frames into the 4-level section hierarchy. Three input modes are available via a segmented control:

- **По полям** — separate fields for Format / Channel / Platform / Creative with autocomplete.
- **Путь** — single slash-separated path input (`Format/Channel/Platform/Creative`) with segment-aware autocomplete and a breadcrumb hint.
- **Секции** — browse existing sections on the page in a searchable tree or table view; click **+** next to any creative to place the selected frames there directly.

In "По полям" and "Путь" modes:

1. Select one or more frames on the page.
2. Fill in Format / Channel / Platform / Creative.
3. Click **"Поместить в секции"** — the plugin creates missing sections, places the frames inside the creative section, and resizes all parent sections to fit.

Layout rules:

- Frames within a creative are stacked **vertically** (GIF slides — horizontally).
- New creative sections are placed to the **right** of existing ones within a platform.
- New platform / channel sections are placed **below** existing ones.
- All sections are resized bottom-up (creative → platform → channel → format) to tightly wrap their content with configurable padding (see `src/shared/config/index.ts`).

### Export

When clicking "Export":

1. All frames are automatically renamed to `{width}x{height}` (e.g., `1080x1920`). The same renaming also happens when running **"Выровнять секции"** (Align sections).
2. Frames are exported one at a time (PNG → target format).
3. Compression is applied to meet file size limits.
4. Results are packaged into ZIP.

The Export button is always visible at the bottom of the window. After export completes, it is replaced by the **Download ZIP** button which shows the ZIP size and file count (e.g. `Скачать ZIP · 2.34 МБ · 42 файла`). If only a specific format or platform was exported, the label includes that filter (e.g. `Скачать ZIP JPG` or `Скачать ZIP VK`). A **preview.html** file is also included in the ZIP — open it in a browser to review all exported images as a gallery.

#### File Size Limits

Limits are set in the plugin interface — globally per platform or individually per frame (in MB). Per-frame limits are accessed via the **Resizes** button, which opens a dedicated screen. The button shows the total frame count.

The screen has a search field and two view modes toggled by icons in the header:

- **Tree** — collapsible hierarchy (Format → Channel → Platform → Creative → frames), all nodes expanded by default.
- **Table** — flat list with a sticky header (Format / Channel / Platform / Creative / Size / Limit columns). Each row includes the frame name and, for GIF, the frame count in the Size column.

#### Compression Algorithm

| Format     | Method                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| JPG / WebP | Binary search over `quality` parameter (0–1)                                                                        |
| PNG        | Binary search over color quantization level (2–256)                                                                 |
| GIF        | Binary search over `maxColors` (2–255) × 3 dithering algorithms (Bayer, Floyd-Steinberg, Jarvis-Judice-Ninke); the combination achieving the highest palette size within the limit is used |

#### ZIP Path Mode

A segmented control allows choosing the folder structure in the ZIP:

- **Format/Channel/Platform/Creative** — includes the format folder at the top level
- **Channel/Platform/Creative** — without the format folder

### Architecture

Two-thread Figma plugin model with Feature-Sliced Design:

| File                                            | Thread                     | Role                                                                                           |
| ----------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/app/figma.ts`                              | Main thread (sandbox)      | Entry point: `showUI`, registers feature handlers, page-level Figma events                     |
| `src/features/export-frames/api/`               | Main thread                | Export handlers: scan, rename, export pipeline, documentchange debounce                        |
| `src/features/place-sections/api/`              | Main thread                | Place/align handlers: create sections, position frames                                         |
| `src/entities/frame/api/`                       | Main thread                | `scanPage()`, `getSectionsHierarchy()`, shared `exportItems` state                             |
| `src/shared/lib/figma.ts`                       | Main thread                | `isSection`, `isFrame`, `isExportableNode`, `fitSectionToChildren`, `resizeSectionOnly`, `setSectionFill` |
| `src/app/index.tsx`                             | UI thread (iframe, Preact) | Entry point — mounts `Root`, contains global CSS                                               |
| `src/pages/export/ui/ExportPage.tsx`            | —                          | Export tab — screen state, calls `useExport()`                                                 |
| `src/pages/organize/ui/OrganizePage.tsx`        | —                          | Place tab component                                                                            |
| `src/widgets/resize-limits/ui/`                 | —                          | Per-frame size limits sub-screen (tree/table) + components                                     |
| `src/widgets/platform-limits/ui/`               | —                          | Per-format/platform limits section + `FormatRow`, `PlatformRow`, `GifDelayRow`                 |
| `src/widgets/section-tree/ui/`                  | —                          | Section tree panel (tree/table view) + node components                                         |
| `src/features/export-frames/model/useExport.ts` | —                          | Custom hook: all export state, effects, and handlers                                           |
| `src/features/export-frames/ui/SetupGuide.tsx`  | —                          | Empty-state setup instructions                                                                 |
| `src/features/place-sections/ui/components/`    | —                          | `SelectionIndicator`, `PlaceResultMessage`, `PathField`, `PathInput`                           |
| `src/entities/frame/model/`                     | —                          | Frame/tree types and tree filtering utilities                                                  |
| `src/shared/ui/`                                | —                          | Shared UI: `TagBadge`, `NumInput`, `ProgressBar`, `TabBar`, `ResizeHandle`, `ComboboxDropdown`, `FlatTableHeader`, `FlatTableRow`, `SearchInput` |
| `src/shared/config/strings.ts`                  | —                          | Centralised string constants for all user-visible UI text |
| `src/shared/lib/`                               | —                          | Pure utilities: compression, GIF assembly, HTML preview, declension, Figma helpers             |
| `src/shared/config/index.ts`                    | —                          | Central config: window size, layout constants, compression parameters, `FORMATS`               |
| `src/shared/analytics/index.ts`                 | —                          | PostHog analytics                                                                              |
| `src/shared/logger/index.ts`                    | —                          | Dev-only log forwarder                                                                         |

Communication between threads via `emit` / `on` from `@create-figma-plugin/utilities`.

#### Build Process (`scripts/build.js`)

1. Cleans `dist/` before building to avoid stale artifacts.
2. esbuild: `src/app/figma.ts` → `dist/code.js` (fully minified).
3. esbuild: `src/app/index.tsx` bundled in memory (`write: false`) with whitespace + syntax minification (identifiers are not mangled to prevent CSS module class-name collisions). JSX via `preact/jsx-runtime`.
5. JS and CSS are read from `result.outputFiles`, assembled into an HTML wrapper, minified by `@minify-html/node`, and written to `dist/ui.html`. No intermediate `ui.js`/`ui.css` files are written to disk.
6. Calls `manifest.js(env)` and writes result to `dist/manifest.json` (env vars injected into `name`, `networkAccess.allowedDomains`, and `networkAccess.devAllowedDomains`)

`manifest.js` at the root is the source of truth for the manifest. Do not edit `dist/manifest.json` directly.

### Dependencies

| Package                   | Purpose                               |
| ------------------------- | ------------------------------------- |
| `jszip`                   | ZIP assembly in the browser           |
| `modern-gif`              | GIF encoding on the main thread       |
| `preact`                  | UI framework                          |
| `@create-figma-plugin/ui` | Figma-styled UI components            |
| `@figma/plugin-typings`   | TypeScript types for Figma Plugin API |
| `esbuild`                 | Bundler                               |
| `@minify-html/node`       | HTML wrapper minification (dev)       |

---

## RU

Figma-плагин для пакетного экспорта фреймов в JPG, PNG, WebP или GIF с ограничением размера файла. Результат упаковывается в ZIP-архив.

### Установка

Скачайте последний релиз с [Releases](https://github.com/a-lagutov/export-prod/releases) и распакуйте архив.

В Figma: **Plugins → Development → Import plugin from manifest** → выберите файл `manifest.json` из папки `ADV-Export-Prod`.

### Разработка

```bash
npm run watch   # Watch-режим: пересборка app/figma.ts + app/index.tsx при изменениях (NODE_ENV=development)
npm run build   # Полная сборка (app/figma.ts + app/index.tsx → dist/, NODE_ENV=production)
```

#### Переменные окружения

Env-файлы загружаются в порядке приоритета (как в CRA) и инжектируются при сборке.

| Переменная     | Файл                                   | Назначение                                                                                                   |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POSTHOG_KEY`  | `.env.production.local` (в gitignore)  | Ключ аналитики для продакшна                                                                                 |
| `POSTHOG_KEY`  | `.env.development.local` (в gitignore) | Ключ аналитики для разработки (события помечаются `is_test_user: true`)                                      |
| `POSTHOG_HOST` | `.env`                                 | Хост аналитики; также задаёт `networkAccess.allowedDomains` в `dist/manifest.json`                           |
| `PLUGIN_NAME`  | `.env`                                 | Отображаемое имя плагина в Figma; задаёт `name` в `dist/manifest.json`                                       |
| `PLUGIN_ID`    | `.env`                                 | ID плагина в Figma; задаёт `id` в `dist/manifest.json`                                                       |
| `LOG_SERVER`   | `.env.development`                     | URL лог-сервера (`http://localhost:3001`); добавляется в `manifest.json` → `networkAccess.devAllowedDomains` |

Создайте `.env.production.local` (и при необходимости `.env.development.local`) с вашим ключом PostHog:

```
POSTHOG_KEY=phc_...
```

#### Логирование в режиме разработки

`npm run watch` автоматически запускает локальный HTTP лог-сервер (порт 3001), если задана переменная `LOG_SERVER`. Логи пишутся в:

- `logs/ui.log` — структурированные логи из UI-потока и main-потока плагина
- `logs/figma.log` — вызовы `console.warn` / `console.error` из Figma iframe

Изменения в `scripts/log-server.js` применяются без перезапуска `npm run watch`.

### Структура страницы в Figma

Плагин сканирует текущую страницу и ищет 4 уровня вложенных секций:

```
Формат (JPG / PNG / WEBP / GIF)
  └─ Канал (например: 5_Context_Media)
       └─ Площадка (например: VK, TG, Bigo)
            └─ Креатив (например: 1234-card)
                 └─ Фреймы / Компонентные инстансы
```

Имена секций формата должны точно совпадать с названием формата (регистр не важен).

#### Нейминг креативов

```
xxxx-yyy
```

- `xxxx` — номер задачи в Jira
- `yyy` — условное обозначение креатива

Несколько слов в названии разделяются точкой:

```
1234-card
1234-yellow.card
1234-black.friday
```

#### GIF

Фреймы внутри одного креатива группируются в анимацию по Y-позиции (фреймы на одной горизонтали = одна GIF-анимация). Кадры сортируются слева направо по X.

### Размещение фреймов (вкладка «Разместить»)

Вкладка **Разместить** позволяет раскладывать фреймы по 4-уровневой иерархии секций. Доступны три режима ввода (сегментированный контрол):

- **По полям** — отдельные поля Формат / Канал / Площадка / Креатив с автодополнением.
- **Путь** — единое поле со слэш-разделителем (`Формат/Канал/Площадка/Креатив`) и контекстным автодополнением по сегментам.
- **Секции** — просмотр существующих секций страницы в виде дерева или таблицы с поиском; нажмите **+** рядом с нужным креативом, чтобы сразу поместить туда выделенные фреймы.

В режимах «По полям» и «Путь»:

1. Выделите один или несколько фреймов на странице.
2. Заполните нужные поля.
3. Нажмите **«Поместить в секции»** — плагин создаст недостающие секции, поместит фреймы в секцию креатива и обновит размеры всех родительских секций.

Правила раскладки:

- Фреймы внутри креатива укладываются **вертикально** (кадры GIF — горизонтально).
- Новые секции креатива размещаются **правее** существующих внутри площадки.
- Новые секции площадки / канала размещаются **ниже** существующих.
- Все секции обновляются снизу вверх (креатив → площадка → канал → формат): плотно оборачивают содержимое с настраиваемым отступом (см. `src/shared/config/index.ts`).

### Экспорт

При нажатии «Экспорт»:

1. Все фреймы автоматически переименовываются в `{ширина}x{высота}` (например, `1080x1920`). То же переименование выполняется при нажатии **«Выровнять секции»**.
2. Фреймы экспортируются по одному (PNG → целевой формат).
3. Применяется сжатие для соблюдения лимитов по размеру файла.
4. Результат упаковывается в ZIP.

Кнопка «Экспорт» всегда видна внизу окна. После завершения она заменяется кнопкой **«Скачать ZIP»**, на которой отображается размер архива и количество файлов (например, `Скачать ZIP · 2.34 МБ · 42 файла`). Если экспортировался только конкретный формат или площадка, это отображается в метке кнопки (например, `Скачать ZIP JPG` или `Скачать ZIP VK`). В ZIP также включается файл **preview.html** — откройте его в браузере для просмотра всех экспортированных изображений галереей.

#### Лимиты размера

Лимиты задаются в интерфейсе плагина — глобально по площадке или отдельно для каждого фрейма (в МБ). Лимиты по фреймам доступны через кнопку **Ресайзы**, которая открывает отдельный экран. На кнопке отображается общее количество файлов.

На экране есть строка поиска и два режима отображения, переключаемых иконками в заголовке:

- **Дерево** — раскрываемая иерархия (Формат → Канал → Площадка → Креатив → фреймы), все узлы раскрыты по умолчанию.
- **Таблица** — плоский список с прилипающей шапкой (Формат / Канал / Площадка / Креатив / Ресайз / Лимит). В колонке «Ресайз» отображается имя фрейма и, для GIF, количество кадров.

#### Алгоритм сжатия

| Формат     | Метод                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JPG / WebP | Бинарный поиск по параметру `quality` (0–1)                                                                                                             |
| PNG        | Бинарный поиск по уровню квантования цвета (2–256)                                                                                                      |
| GIF        | Бинарный поиск по `maxColors` (2–255) × 3 алгоритма дизеринга (Bayer, Floyd-Steinberg, Jarvis-Judice-Ninke); выбирается комбинация с наибольшей палитрой в рамках лимита |

#### Режим путей в ZIP

Сегментированный контрол позволяет выбрать структуру папок в ZIP:

- **Формат/Канал/Площадка/Креатив** — включает папку формата верхнего уровня
- **Канал/Площадка/Креатив** — без папки формата

### Архитектура

Двухпоточная модель Figma-плагинов с Feature-Sliced Design:

| Файл                                            | Поток                      | Роль                                                                                                  |
| ----------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/app/figma.ts`                              | Main thread (sandbox)      | Точка входа: `showUI`, регистрация обработчиков, события страницы                                     |
| `src/features/export-frames/api/`               | Main thread                | Обработчики экспорта: scan, rename, pipeline, debounce documentchange                                 |
| `src/features/place-sections/api/`              | Main thread                | Обработчики place/align: создание секций, позиционирование фреймов                                    |
| `src/entities/frame/api/`                       | Main thread                | `scanPage()`, `getSectionsHierarchy()`, общий стейт `exportItems`                                     |
| `src/shared/lib/figma.ts`                       | Main thread                | `isSection`, `isFrame`, `fitSectionToChildren`, `resizeSectionOnly`, `setSectionFill`                 |
| `src/app/index.tsx`                             | UI thread (iframe, Preact) | Точка входа — монтирует `Root`, содержит глобальные CSS-правила                                       |
| `src/pages/export/ui/ExportPage.tsx`            | —                          | Вкладка «Экспорт» — screen-стейт, вызывает `useExport()`                                              |
| `src/pages/organize/ui/OrganizePage.tsx`        | —                          | Компонент вкладки «Разместить»                                                                        |
| `src/widgets/resize-limits/ui/`                 | —                          | Экран лимитов по ресайзам (дерево/таблица) + компоненты                                               |
| `src/widgets/platform-limits/ui/`               | —                          | Секция лимитов по площадкам + `FormatRow`, `PlatformRow`, `GifDelayRow`                               |
| `src/widgets/section-tree/ui/`                  | —                          | Панель дерева секций (дерево/таблица) + компоненты узлов                                              |
| `src/features/export-frames/model/useExport.ts` | —                          | Кастомный хук: весь state, эффекты и обработчики экспорта                                             |
| `src/features/export-frames/ui/SetupGuide.tsx`  | —                          | Инструкции для пустого состояния                                                                      |
| `src/features/place-sections/ui/components/`    | —                          | `SelectionIndicator`, `PlaceResultMessage`, `PathField`, `PathInput`                                  |
| `src/entities/frame/model/`                     | —                          | Типы фреймов/дерева и утилиты фильтрации дерева                                                       |
| `src/shared/ui/`                                | —                          | Общие компоненты: `TagBadge`, `NumInput`, `ProgressBar`, `TabBar`, `ResizeHandle`, `ComboboxDropdown`, `FlatTableHeader`, `FlatTableRow`, `SearchInput` |
| `src/shared/config/strings.ts`                  | —                          | Централизованные строковые константы для всех пользовательских текстов интерфейса                     |
| `src/shared/lib/`                               | —                          | Утилиты: сжатие, сборка GIF, HTML-превью, склонение, хелперы Figma                                    |
| `src/shared/config/index.ts`                    | —                          | Центральный конфиг: размер окна, константы раскладки, параметры сжатия, `FORMATS`                     |
| `src/shared/analytics/index.ts`                 | —                          | Аналитика PostHog                                                                                     |
| `src/shared/logger/index.ts`                    | —                          | Лог-форвардер для режима разработки                                                                   |

Общение между потоками через `emit` / `on` из `@create-figma-plugin/utilities`.

#### Сборка (`scripts/build.js`)

1. Очищает `dist/` перед сборкой, чтобы не оставалось устаревших артефактов.
2. esbuild: `src/app/figma.ts` → `dist/code.js` (полная минификация).
3. esbuild: `src/app/index.tsx` бандлируется в памяти (`write: false`) с минификацией пробелов и синтаксиса (имена идентификаторов не сокращаются, чтобы избежать коллизий имён классов CSS-модулей). JSX через `preact/jsx-runtime`.
5. JS и CSS читаются из `result.outputFiles`, собираются в HTML-обёртку, минифицируются через `@minify-html/node` и записываются в `dist/ui.html`. Промежуточные файлы `ui.js`/`ui.css` на диск не записываются.
6. Вызывает `manifest.js(env)` и записывает результат в `dist/manifest.json` (env-переменные подставляются в `name`, `networkAccess.allowedDomains` и `networkAccess.devAllowedDomains`)

`manifest.js` в корне — источник истины для манифеста. Не редактируйте `dist/manifest.json` напрямую.

### Зависимости

| Пакет                     | Назначение                        |
| ------------------------- | --------------------------------- |
| `jszip`                   | Сборка ZIP в браузере             |
| `modern-gif`              | Кодирование GIF в главном потоке  |
| `preact`                  | UI-фреймворк                      |
| `@create-figma-plugin/ui` | Компоненты в стиле Figma          |
| `@figma/plugin-typings`   | TypeScript-типы Figma Plugin API  |
| `esbuild`                 | Бандлер                           |
| `@minify-html/node`       | Минификация HTML-обёртки (dev)    |
