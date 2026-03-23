import { TextboxNumeric } from '@create-figma-plugin/ui'

/**
 * Numeric input wrapper around `TextboxNumeric` from `@create-figma-plugin/ui`.
 * Accepts a `containerRef` so callers can programmatically focus the inner input
 * via `containerRef.current?.querySelector('input')?.focus()`.
 * Validates on blur — rejects zero and negative values.
 */
export function NumInput({
  value,
  onChange,
  suffix,
  containerRef,
}: {
  value: string
  onChange: (v: string) => void
  suffix?: string
  containerRef?: { current: HTMLDivElement | null }
}) {
  return (
    <div ref={containerRef}>
      <TextboxNumeric
        variant="border"
        value={value}
        onValueInput={onChange}
        suffix={suffix}
        placeholder="0"
        validateOnBlur={(v) => (v === null || v <= 0 ? null : v)}
      />
    </div>
  )
}
