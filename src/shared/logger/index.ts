// Dev-only logger — sends structured logs to the local log server (localhost:3001).
// In production (__DEV__ = false) all sends are no-ops; console output is preserved.

declare const __DEV__: boolean
declare const __LOG_SERVER__: string

type Level = 'log' | 'warn' | 'error' | 'info'

/**
 * Posts a structured log entry to the local dev log server. No-op in production or when LOG_SERVER is unset.
 * @param level - Log level: `"log"`, `"warn"`, `"error"`, or `"info"`.
 * @param thread - Source thread identifier (e.g. `"ui"`, `"code"`, `"figma"`).
 * @param message - Human-readable log message.
 * @param data - Optional structured payload to attach.
 */
function send(level: Level, thread: string, message: string, data?: unknown): void {
  if (!__DEV__ || !__LOG_SERVER__) return
  fetch(`${__LOG_SERVER__}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, thread, message, data, timestamp: new Date().toISOString() }),
  }).catch(() => {})
}

/** Logs a message at `log` level to the console and dev log server (UI thread). */
export function log(message: string, data?: unknown): void {
  console.log(message, ...(data !== undefined ? [data] : []))
  send('log', 'ui', message, data)
}

/** Logs a message at `warn` level to the console and dev log server (UI thread). */
export function warn(message: string, data?: unknown): void {
  console.warn(message, ...(data !== undefined ? [data] : []))
  send('warn', 'ui', message, data)
}

/** Logs a message at `error` level to the console and dev log server (UI thread). */
export function error(message: string, data?: unknown): void {
  console.error(message, ...(data !== undefined ? [data] : []))
  send('error', 'ui', message, data)
}

/** Logs a message at `info` level to the console and dev log server (UI thread). */
export function info(message: string, data?: unknown): void {
  console.info(message, ...(data !== undefined ? [data] : []))
  send('info', 'ui', message, data)
}

/**
 * Forwards a log entry received from the code thread to the console and dev log server.
 * Called when a `code-log` message arrives in the UI thread via `on('code-log', ...)`.
 */
// Called by ui.tsx when it receives a { type: 'log' } message forwarded from code.ts
export function fromCodeThread(level: Level, message: string, data?: unknown): void {
  console.log(`[code] ${message}`, ...(data !== undefined ? [data] : []))
  send(level, 'code', message, data)
}

// In dev mode: intercept native console output → figma.log
// Also patch HTMLCanvasElement.getContext to suppress willReadFrequently warnings.
if (__DEV__ && __LOG_SERVER__) {
  const _warn = console.warn.bind(console)
  const _error = console.error.bind(console)

  console.warn = (msg?: unknown, ...args: unknown[]) => {
    _warn(msg, ...args)
    send('warn', 'figma', String(msg), args.length ? args : undefined)
  }

  console.error = (msg?: unknown, ...args: unknown[]) => {
    _error(msg, ...args)
    send('error', 'figma', String(msg), args.length ? args : undefined)
  }

  // Capture uncaught exceptions and unhandled promise rejections
  window.addEventListener('error', (event) => {
    send('error', 'figma', event.message, {
      filename: event.filename,
      line: event.lineno,
      col: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    send('error', 'figma', String(event.reason))
  })

  // Fix gif.js: canvas.getContext('2d') without willReadFrequently triggers a browser warning
  const _getContext = HTMLCanvasElement.prototype.getContext
  // @ts-expect-error — overload signatures don't cover the generic case
  HTMLCanvasElement.prototype.getContext = function (
    type: string,
    options?: Record<string, unknown>,
  ) {
    if (type === '2d') return _getContext.call(this, type, { willReadFrequently: true, ...options })
    return _getContext.call(this, type, options as never)
  }
}
