// Dev-only logger — sends structured logs to the local log server (localhost:3001).
// In production (__DEV__ = false) all sends are no-ops; console output is preserved.

declare const __DEV__: boolean
declare const __LOG_SERVER__: string

type Level = 'log' | 'warn' | 'error' | 'info'

function send(level: Level, thread: string, message: string, data?: unknown): void {
  if (!__DEV__ || !__LOG_SERVER__) return
  fetch(`${__LOG_SERVER__}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, thread, message, data, timestamp: new Date().toISOString() }),
  }).catch(() => {})
}

export function log(message: string, data?: unknown): void {
  console.log(message, ...(data !== undefined ? [data] : []))
  send('log', 'ui', message, data)
}

export function warn(message: string, data?: unknown): void {
  console.warn(message, ...(data !== undefined ? [data] : []))
  send('warn', 'ui', message, data)
}

export function error(message: string, data?: unknown): void {
  console.error(message, ...(data !== undefined ? [data] : []))
  send('error', 'ui', message, data)
}

export function info(message: string, data?: unknown): void {
  console.info(message, ...(data !== undefined ? [data] : []))
  send('info', 'ui', message, data)
}

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
