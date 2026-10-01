import { emit } from '@create-figma-plugin/utilities'

/** Drag handle in the bottom-right corner that lets the user resize the plugin window height. */
export function ResizeHandle() {
  /**
   * Begins tracking mouse movement on mousedown to compute new window height.
   * @param e - The mousedown event on the handle.
   */
  function onMouseDown(e: MouseEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = window.innerHeight

    /**
     * Emits the new window height while dragging (never below 200px).
     * @param ev - The mousemove event.
     */
    function onMove(ev: MouseEvent) {
      const newH = Math.max(200, startH + (ev.clientY - startY))
      emit('resize', { height: Math.round(newH) })
    }

    /** Stops tracking the drag once the mouse button is released. */
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: 16,
        height: 16,
        cursor: 'nwse-resize',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 2,
        zIndex: 100,
      }}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d="M7 1L1 7M7 4L4 7"
          stroke="var(--figma-color-text-tertiary)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
