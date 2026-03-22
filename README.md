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
npm run watch   # Watch mode: rebuilds code.ts + ui.tsx on changes (NODE_ENV=development)
npm run build   # Full build (code.ts + ui.tsx → dist/, NODE_ENV=production)
```

#### Environment variables

Env files follow CRA priority order and are injected at build time.

| Variable | File | Purpose |
|---|---|---|
| `POSTHOG_KEY` | `.env.production.local` (gitignored) | Analytics key for production |
| `POSTHOG_KEY` | `.env.development.local` (gitignored) | Analytics key for development (events marked `is_test_user: true`) |
| `POSTHOG_HOST` | `.env` | Analytics host; also sets `networkAccess.allowedDomains` in `dist/manifest.json` |
| `PLUGIN_NAME` | `.env` | Plugin display name in Figma; sets `name` in `dist/manifest.json` |
| `LOG_SERVER` | `.env.development` | Dev log server URL (`http://localhost:3001`); added to `manifest.json` → `networkAccess.devAllowedDomains` |

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
                 └─ Frame(s)
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

The **Place** tab lets you organize frames into the 4-level section hierarchy directly from the plugin:

1. Select one or more frames on the page.
2. Fill in Format / Channel / Platform / Creative fields.
3. Click **"Поместить в секции"** — the plugin creates missing sections, places the frames inside the creative section, and resizes all parent sections to fit.

Layout rules:
- Frames within a creative are stacked **vertically** (GIF slides — horizontally).
- New creative sections are placed to the **right** of existing ones within a platform.
- New platform / channel sections are placed **below** existing ones.
- All sections are resized bottom-up (creative → platform → channel → format) to tightly wrap their content with 250 px padding.

### Export

When clicking "Export":

1. All frames are automatically renamed to `{width}x{height}` (e.g., `1080x1920`).
2. Frames are exported one at a time (PNG → target format).
3. Compression is applied to meet file size limits.
4. Results are packaged into ZIP.

The Export button is always visible at the bottom of the window. After export completes, it is replaced by the **Download ZIP** button which shows the ZIP size and file count (e.g. `Скачать ZIP · 2.34 МБ · 42 файла`). If only a specific format or platform was exported, the label includes that filter (e.g. `Скачать ZIP JPG` or `Скачать ZIP VK`). A **preview.html** file is also included in the ZIP — open it in a browser to review all exported images as a gallery.

#### File Size Limits

Limits are set in the plugin interface — globally per platform or individually per frame (in MB).

#### Compression Algorithm

| Format | Method |
|--------|--------|
| JPG / WebP | Binary search over `quality` parameter (0–1) |
| PNG | Binary search over color quantization level (2–256) |
| GIF | Binary search over gif.js `quality` parameter (1–30) |

#### ZIP Path Mode

A segmented control allows choosing the folder structure in the ZIP:

- **Format/Channel/Platform/Creative** — includes the format folder at the top level
- **Channel/Platform/Creative** — without the format folder

### Architecture

Two-thread Figma plugin model:

| File | Thread | Role |
|------|--------|------|
| `src/code.ts` | Main thread (sandbox) | Page tree scanning, PNG export, frame renaming |
| `src/ui.tsx` | UI thread (iframe, Preact) | Format conversion, GIF assembly, ZIP building, interface |

Communication between threads via `postMessage` / `figma.ui.postMessage`.

#### Build Process (`scripts/build.js`)

1. esbuild: `src/code.ts` → `dist/code.js`
2. Reads `gif.worker.js` from `node_modules/gif.js/dist/` and passes content via esbuild `define` as `__GIF_WORKER_CONTENT__`
3. esbuild: `src/ui.tsx` → `dist/ui.js` + `dist/ui.css` (JSX via preact/jsx-runtime)
4. Inline JS and CSS into `dist/ui.html` (Figma doesn't resolve external files)
5. Calls `manifest.js(env)` and writes result to `dist/manifest.json` (env vars injected into `name`, `networkAccess.allowedDomains`, and `networkAccess.devAllowedDomains`)

`manifest.js` at the root is the source of truth for the manifest. Do not edit `dist/manifest.json` directly.

### Dependencies

| Package | Purpose |
|---------|---------|
| `jszip` | ZIP assembly in the browser |
| `gif.js` | GIF encoding via Web Workers |
| `preact` | UI framework |
| `@create-figma-plugin/ui` | Figma-styled UI components |
| `@figma/plugin-typings` | TypeScript types for Figma Plugin API |
| `esbuild` | Bundler |

---

## RU

Figma-плагин для пакетного экспорта фреймов в JPG, PNG, WebP или GIF с ограничением размера файла. Результат упаковывается в ZIP-архив.

### Установка

Скачайте последний релиз с [Releases](https://github.com/a-lagutov/export-prod/releases) и распакуйте архив.

В Figma: **Plugins → Development → Import plugin from manifest** → выберите файл `manifest.json` из папки `ADV-Export-Prod`.

### Разработка

```bash
npm run watch   # Watch-режим: пересборка code.ts + ui.tsx при изменениях (NODE_ENV=development)
npm run build   # Полная сборка (code.ts + ui.tsx → dist/, NODE_ENV=production)
```

#### Переменные окружения

Env-файлы загружаются в порядке приоритета (как в CRA) и инжектируются при сборке.

| Переменная | Файл | Назначение |
|---|---|---|
| `POSTHOG_KEY` | `.env.production.local` (в gitignore) | Ключ аналитики для продакшна |
| `POSTHOG_KEY` | `.env.development.local` (в gitignore) | Ключ аналитики для разработки (события помечаются `is_test_user: true`) |
| `POSTHOG_HOST` | `.env` | Хост аналитики; также задаёт `networkAccess.allowedDomains` в `dist/manifest.json` |
| `PLUGIN_NAME` | `.env` | Отображаемое имя плагина в Figma; задаёт `name` в `dist/manifest.json` |
| `LOG_SERVER` | `.env.development` | URL лог-сервера (`http://localhost:3001`); добавляется в `manifest.json` → `networkAccess.devAllowedDomains` |

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
                 └─ Frame(s)
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

Вкладка **Разместить** позволяет раскладывать фреймы по 4-уровневой иерархии секций прямо из плагина:

1. Выделите один или несколько фреймов на странице.
2. Заполните поля Формат / Канал / Площадка / Креатив.
3. Нажмите **«Поместить в секции»** — плагин создаст недостающие секции, поместит фреймы в секцию креатива и обновит размеры всех родительских секций.

Правила раскладки:
- Фреймы внутри креатива укладываются **вертикально** (кадры GIF — горизонтально).
- Новые секции креатива размещаются **правее** существующих внутри площадки.
- Новые секции площадки / канала размещаются **ниже** существующих.
- Все секции обновляются снизу вверх (креатив → площадка → канал → формат): плотно оборачивают содержимое с отступом 250 px.

### Экспорт

При нажатии «Экспорт»:

1. Все фреймы автоматически переименовываются в `{ширина}x{высота}` (например, `1080x1920`).
2. Фреймы экспортируются по одному (PNG → целевой формат).
3. Применяется сжатие для соблюдения лимитов по размеру файла.
4. Результат упаковывается в ZIP.

Кнопка «Экспорт» всегда видна внизу окна. После завершения она заменяется кнопкой **«Скачать ZIP»**, на которой отображается размер архива и количество файлов (например, `Скачать ZIP · 2.34 МБ · 42 файла`). Если экспортировался только конкретный формат или площадка, это отображается в метке кнопки (например, `Скачать ZIP JPG` или `Скачать ZIP VK`). В ZIP также включается файл **preview.html** — откройте его в браузере для просмотра всех экспортированных изображений галереей.

#### Лимиты размера

Лимиты задаются в интерфейсе плагина — глобально по площадке или отдельно для каждого фрейма (в МБ).

#### Алгоритм сжатия

| Формат | Метод |
|--------|-------|
| JPG / WebP | Бинарный поиск по параметру `quality` (0–1) |
| PNG | Бинарный поиск по уровню квантования цвета (2–256) |
| GIF | Бинарный поиск по параметру `quality` gif.js (1–30) |

#### Режим путей в ZIP

Сегментированный контрол позволяет выбрать структуру папок в ZIP:

- **Формат/Канал/Площадка/Креатив** — включает папку формата верхнего уровня
- **Канал/Площадка/Креатив** — без папки формата

### Архитектура

Двухпоточная модель Figma-плагинов:

| Файл | Поток | Роль |
|------|-------|------|
| `src/code.ts` | Main thread (sandbox) | Сканирование дерева страницы, экспорт PNG-байт, переименование фреймов |
| `src/ui.tsx` | UI thread (iframe, Preact) | Конвертация форматов, сборка GIF, ZIP, интерфейс |

Общение между потоками через `postMessage` / `figma.ui.postMessage`.

#### Сборка (`scripts/build.js`)

1. esbuild: `src/code.ts` → `dist/code.js`
2. Читает `gif.worker.js` из `node_modules/gif.js/dist/` и передаёт содержимое через esbuild `define` как `__GIF_WORKER_CONTENT__`
3. esbuild: `src/ui.tsx` → `dist/ui.js` + `dist/ui.css` (JSX через preact/jsx-runtime)
4. Инлайн JS и CSS в `dist/ui.html` (Figma не резолвит внешние файлы)
5. Вызывает `manifest.js(env)` и записывает результат в `dist/manifest.json` (env-переменные подставляются в `name`, `networkAccess.allowedDomains` и `networkAccess.devAllowedDomains`)

`manifest.js` в корне — источник истины для манифеста. Не редактируйте `dist/manifest.json` напрямую.

### Зависимости

| Пакет | Назначение |
|-------|-----------|
| `jszip` | Сборка ZIP в браузере |
| `gif.js` | Кодирование GIF через Web Workers |
| `preact` | UI-фреймворк |
| `@create-figma-plugin/ui` | Компоненты в стиле Figma |
| `@figma/plugin-typings` | TypeScript-типы Figma Plugin API |
| `esbuild` | Бандлер |
