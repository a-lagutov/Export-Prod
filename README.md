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
npm run watch   # Rebuild code.ts on changes
npm run build   # Full build (code.ts + ui.tsx → dist/)
```

> `watch` does not rebuild `ui.html`. When changing `src/ui.tsx`, use full `npm run build`.

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

After completion, a "Download preview HTML" button is available — opens all exported files as a gallery in the browser.

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
5. Copy `manifest.json` from root → `dist/manifest.json`

`manifest.json` is stored at the root with dist-level paths. Do not edit `dist/manifest.json` directly.

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
npm run watch   # Пересборка code.ts при изменениях
npm run build   # Полная сборка (code.ts + ui.tsx → dist/)
```

> `watch` не пересобирает `ui.html`. При изменении `src/ui.tsx` нужен полный `npm run build`.

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

После завершения доступна кнопка «Скачать превью HTML» — открывает все экспортированные файлы в виде галереи в браузере.

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
5. Копирует `manifest.json` из корня → `dist/manifest.json`

`manifest.json` хранится в корне проекта с путями на уровне `dist/`. Не редактируйте `dist/manifest.json` напрямую.

### Зависимости

| Пакет | Назначение |
|-------|-----------|
| `jszip` | Сборка ZIP в браузере |
| `gif.js` | Кодирование GIF через Web Workers |
| `preact` | UI-фреймворк |
| `@create-figma-plugin/ui` | Компоненты в стиле Figma |
| `@figma/plugin-typings` | TypeScript-типы Figma Plugin API |
| `esbuild` | Бандлер |
