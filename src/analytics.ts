// PostHog analytics — fire-and-forget, injected at build time via esbuild define
declare const __POSTHOG_KEY__: string
declare const __POSTHOG_HOST__: string
declare const __VERSION__: string
declare const __DEV__: boolean

// Figma plugin UI runs in a data: URL — localStorage is unavailable.
// Use a session-scoped ID (a new ID per plugin open is acceptable for analytics).
const SESSION_ID = 'session_' + Math.random().toString(36).slice(2) + Date.now().toString(36)

export function track(event: string, props?: Record<string, unknown>): void {
  if (!__POSTHOG_KEY__) return
  fetch(`${__POSTHOG_HOST__}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: __POSTHOG_KEY__,
      event,
      distinct_id: SESSION_ID,
      properties: {
        version: __VERSION__,
        ...(__DEV__ ? { $set: { is_test_user: true } } : {}),
        ...props,
      },
    }),
  }).catch(() => {})
}
