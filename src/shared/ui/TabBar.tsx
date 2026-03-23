/** Top navigation bar with two tabs: "Экспорт" and "Разместить". */
export function TabBar({
  active,
  onChange,
}: {
  active: 'export' | 'organize'
  onChange: (t: 'export' | 'organize') => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--figma-color-border)',
        background: 'var(--figma-color-bg)',
        flexShrink: 0,
      }}
    >
      {(
        [
          { key: 'export', label: 'Экспорт' },
          { key: 'organize', label: 'Разместить' },
        ] as const
      ).map(({ key, label }) => (
        <button
          key={key}
          class={active === key ? 'tab-btn tab-active' : 'tab-btn'}
          onClick={() => onChange(key)}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            borderBottom:
              active === key ? '2px solid var(--figma-color-bg-brand)' : '2px solid transparent',
            background: 'transparent',
            color: active === key ? 'var(--figma-color-text)' : 'var(--figma-color-text-secondary)',
            fontSize: 12,
            fontWeight: active === key ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
