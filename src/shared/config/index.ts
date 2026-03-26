// ── Plugin window ─────────────────────────────────────────────────────────────

export const WINDOW_WIDTH = 500
export const WINDOW_HEIGHT = 450
export const WINDOW_MIN_HEIGHT = 200

// ── Section layout (Place tab) ────────────────────────────────────────────────

/** Padding inside each section around its children */
export const SECTION_FIT_PADDING = 40

/** Internal padding and gap between frames when placing */
export const PLACE_PADDING = 250
export const FRAME_GAP = 250
export const GIF_SLIDE_GAP = 50

/** Horizontal distance between format sections on the canvas */
export const FORMAT_SECTION_GAP = 5000

/** Padding and gap used during section alignment */
export const ALIGN_PADDING = 250
export const ALIGN_GAP = 250
export const ALIGN_FORMAT_GAP = 5000

// ── Section fill opacities ────────────────────────────────────────────────────

export const FORMAT_SECTION_OPACITY = 0.2
export const CHANNEL_SECTION_OPACITY = 0.4
export const PLATFORM_SECTION_OPACITY = 0.6
export const CREATIVE_SECTION_OPACITY = 0.8

// ── Compression ───────────────────────────────────────────────────────────────

/** Number of binary search iterations for JPG/WebP quality */
export const JPG_SEARCH_ITERATIONS = 8

/** Number of binary search iterations for PNG quantization */
export const PNG_SEARCH_ITERATIONS = 8

/** PNG quantization levels range */
export const PNG_LEVELS_MIN = 2
export const PNG_LEVELS_MAX = 256

/** Number of binary search iterations for GIF maxColors */
export const GIF_SEARCH_ITERATIONS = 6

// ── GIF animation ─────────────────────────────────────────────────────────────

/** Default frame delay in seconds (shown in the UI input) */
export const GIF_DELAY_DEFAULT = '3'

/** Fallback delay in milliseconds if the input is invalid */
export const GIF_DELAY_FALLBACK_MS = 3000

// ── Formats ───────────────────────────────────────────────────────────────────

/** Supported export formats — defines valid top-level section names */
export const FORMATS = ['jpg', 'png', 'webp', 'gif'] as const
export type Format = (typeof FORMATS)[number]

// ── Misc ──────────────────────────────────────────────────────────────────────

/** Debounce delay before re-scanning after a document change */
export const RESCAN_DEBOUNCE_MS = 500

/** Export scale factor passed to the Figma export API */
export const EXPORT_SCALE = 1
