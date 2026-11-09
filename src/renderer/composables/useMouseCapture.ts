import { onBeforeUnmount, onMounted } from 'vue'
import { api } from '../bridge'

const CAPTURE_SELECTOR = '[data-capture]'
const THROTTLE_MS = 32

/**
 * While the overlay is click-through, Electron still forwards mouse moves. Hit-test them and ask
 * main to capture the mouse only while the pointer is over a card, so buttons and checkboxes
 * work without taking keyboard focus from the game.
 */
export function useMouseCapture(): void {
  let captured = false
  let last = 0

  function onMove(e: MouseEvent): void {
    const now = performance.now()
    if (now - last < THROTTLE_MS) return
    last = now
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(CAPTURE_SELECTOR) != null
    if (over !== captured) {
      captured = over
      void api.invoke('overlay:set-mouse-capture', over)
    }
  }

  function onLeave(): void {
    if (!captured) return
    captured = false
    void api.invoke('overlay:set-mouse-capture', false)
  }

  onMounted(() => {
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseleave', onLeave)
  })
}
