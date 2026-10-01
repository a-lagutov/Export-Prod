/**
 * Centralised string constants for all user-visible text in the plugin UI.
 * Inspired by Android's res/values/strings.xml — every label, button, placeholder,
 * hint, and status message is defined here as a named constant or template function.
 *
 * Static strings: UPPER_SNAKE_CASE constants.
 * Parameterised strings: camelCase functions that return a string.
 */
import { declension } from '../lib/declension'

// ── Tabs ───────────────────────────────────────────────────────────────────────

export const TAB_EXPORT = 'Экспорт'
export const TAB_ORGANIZE = 'Разместить'

// ── Export page ────────────────────────────────────────────────────────────────

export const MSG_SCANNING = 'Сканирование страницы...'
export const BTN_RESCAN = 'Пересканировать'
export const BTN_CANCEL = 'Отмена'
export const BTN_CLEAR_EXPORT = 'Очистить экспорт'
export const BTN_DOWNLOAD_ZIP = 'Скачать ZIP'
export const SUFFIX_MB = 'МБ'

/** Russian declension forms for "файл". Spread into `declension(count, ...DECLENSION_FILE)`. */
export const DECLENSION_FILE = ['файл', 'файла', 'файлов'] as const

/**
 * "Экспорт (3 файла)"
 * @param count
 */
export const exportBtnLabel = (count: number) =>
  `Экспорт · ${count} ${declension(count, ...DECLENSION_FILE)}`

// ── Progress messages ──────────────────────────────────────────────────────────

export const MSG_EXPORT_STARTING = 'Начинаем экспорт...'
export const MSG_CREATING_ZIP = 'Создание ZIP...'
export const MSG_RENAMING_FRAMES = 'Переименование фреймов...'

/**
 * Progress text while converting a single frame.
 * @param index - 0-based frame index.
 * @param total
 * @param path
 */
export const progressProcessing = (index: number, total: number, path: string) =>
  `Обработка ${index + 1}/${total}: ${path}`

/**
 * Progress text while assembling a GIF.
 * @param index - 0-based GIF index.
 * @param total
 * @param path
 */
export const progressGif = (index: number, total: number, path: string) =>
  `Сборка GIF ${index + 1}/${total}: ${path}`

// ── Resize limits screen ───────────────────────────────────────────────────────

export const LABEL_RESIZE_LIMITS = 'Лимиты по ресайзам'
export const LABEL_RESIZES = 'Ресайзы'
export const MSG_NOTHING_FOUND = 'Ничего не найдено'

// ── Table header columns ───────────────────────────────────────────────────────

export const HEADER_RESIZE = 'Ресайз'
export const HEADER_LIMIT = 'Лимит'
export const HEADER_SIZE = 'Размер'

// ── Platform limits section ────────────────────────────────────────────────────

export const LABEL_PLATFORM_LIMITS = 'Лимиты по площадкам'

// ── GIF delay row ──────────────────────────────────────────────────────────────

export const LABEL_GIF_DELAY = 'Задержка GIF'
export const SUFFIX_SEC = 'сек'

// ── Export button tooltips ─────────────────────────────────────────────────────

/**
 * e.g. "Экспортировать только JPG"
 * @param format
 */
export const tooltipExportFormat = (format: string) => `Экспортировать только ${format}`

/**
 * e.g. "Экспортировать JPG / VK"
 * @param format
 * @param name
 */
export const tooltipExportPlatform = (format: string, name: string) =>
  `Экспортировать ${format} / ${name}`

// ── Search ─────────────────────────────────────────────────────────────────────

export const SEARCH_PLACEHOLDER = 'Поиск по размеру, формату, названию...'

// ── Path fields: labels and placeholders ──────────────────────────────────────

export const LABEL_FORMAT = 'Формат'
export const LABEL_CHANNEL = 'Канал'
export const LABEL_PLATFORM = 'Площадка'
export const LABEL_CREATIVE = 'Креатив'
export const PLACEHOLDER_FORMAT = 'JPG, PNG, WEBP или GIF'
export const PLACEHOLDER_CHANNEL = 'например: 5_Context_Media'
export const PLACEHOLDER_PLATFORM = 'например: VK, TG, Bigo'
export const PLACEHOLDER_CREATIVE = 'например: 1234-card'
export const PLACEHOLDER_PATH = ''

// ── Organize (Place) page ──────────────────────────────────────────────────────

export const BTN_PLACE_FRAMES = 'Поместить в секции'
export const MODE_BY_FIELDS = 'По полям'
export const MODE_BY_PATH = 'Путь'
export const MODE_SECTIONS = 'Секции'
export const MSG_FILL_FIELDS = 'Заполните все поля для размещения'
export const HEADER_PATH = 'Путь'

/** Russian declension forms for "фрейм". Spread into `declension(count, ...DECLENSION_FRAME)`. */
export const DECLENSION_FRAME = ['фрейм', 'фрейма', 'фреймов'] as const

/**
 * "Поместить 3 фрейма в секции"
 * @param count
 */
export const placeBtnLabel = (count: number) =>
  `Поместить ${count} ${declension(count, ...DECLENSION_FRAME)} в секции`

// ── Selection indicator ────────────────────────────────────────────────────────

export const MSG_SELECT_FRAMES = 'Выделите фреймы на странице'
export const BTN_ALIGN_SECTIONS = 'Выровнять секции'

/**
 * "Выделено 3 фрейма на странице"
 * @param count
 */
export const selectedFramesLabel = (count: number) =>
  `Выделено ${count} ${declension(count, ...DECLENSION_FRAME)} на странице`

// ── Section tree ───────────────────────────────────────────────────────────────

export const MSG_NO_FRAMES_SELECTED = 'Нет выбранных фреймов'

export const LABEL_ADD_TO_SECTION = 'Добавить в секцию'
export const BTN_ADD_FRAMES_TITLE = 'Добавить выделенные фреймы'

// ── Place result message (code thread) ────────────────────────────────────────

/** Russian declension forms for "фрейм помещён". Spread into `declension(count, ...DECLENSION_FRAME_PLACED)`. */
export const DECLENSION_FRAME_PLACED = [
  'фрейм помещён',
  'фрейма помещено',
  'фреймов помещено',
] as const

/**
 * e.g. "3 фрейма помещено в JPG / Channel / Platform / Creative"
 * @param count
 * @param format
 * @param channel
 * @param platform
 * @param creative
 */
export const placeResultMessage = (
  count: number,
  format: string,
  channel: string,
  platform: string,
  creative: string,
) => {
  const placed = declension(count, ...DECLENSION_FRAME_PLACED)
  return `${count} ${placed} в ${format} / ${channel} / ${platform} / ${creative}`
}

// ── Numeric input ──────────────────────────────────────────────────────────────

export const PLACEHOLDER_ZERO = '0'

// ── Setup guide ────────────────────────────────────────────────────────────────

export const GUIDE_TITLE = 'Как настроить страницу'
export const GUIDE_DESCRIPTION =
  'Плагин ищет на текущей странице вложенные секции с определённой структурой. Создайте 4 уровня секций:'
export const GUIDE_NAMING_TITLE = 'Нейминг креативов'
export const GUIDE_NAMING_JIRA = '— номер задачи в Jira'
export const GUIDE_NAMING_CREATIVE_HINT = '— условное обозначение креатива'
export const GUIDE_NAMING_WORDS_SEPARATOR = 'Несколько слов — через точку:'
export const GUIDE_FRAME_RENAME_NOTE =
  'Имена фреймов (ресайзов) автоматически заменятся на размер фрейма при экспорте (например,'
export const GUIDE_FRAME_SIZE_EXAMPLE = '1080x1920'
export const GUIDE_GIF_NOTE =
  'Для GIF: фреймы на одной Y-позиции станут одной анимацией (слева направо).'
export const GUIDE_NAMING_LINK = 'Гайд по неймингу'
