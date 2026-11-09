import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Point } from '../../shared/geometry'
import type { ItemTextEvent, NoticeEvent, OverlayState } from '../../shared/ipc'
import { api } from '../bridge'

export interface CardState {
  id: number
  text: string
  anchor: Point
  pressedAt: number
  shownAt: number
  pinned: boolean
}

let nextId = 1

export const useOverlayStore = defineStore('overlay', () => {
  const card = ref<CardState | null>(null)
  const converterOpen = ref(false)
  const notice = ref<NoticeEvent | null>(null)
  const state = ref<OverlayState>({
    attached: false,
    gameActive: false,
    interactive: false,
    hasAccess: true,
  })

  function showItem(e: ItemTextEvent): void {
    card.value = {
      id: nextId++,
      text: e.text,
      anchor: e.cursor,
      pressedAt: e.pressedAt,
      shownAt: performance.timeOrigin + performance.now(),
      pinned: false,
    }
  }

  function dismiss(): void {
    card.value = null
    converterOpen.value = false
  }

  function togglePin(): void {
    if (card.value) card.value.pinned = !card.value.pinned
  }

  function showNotice(n: NoticeEvent, ms = 4000): void {
    notice.value = n
    setTimeout(() => {
      if (notice.value === n) notice.value = null
    }, ms)
  }

  watch(
    () => card.value !== null || converterOpen.value,
    (open) => void api.invoke('overlay:set-card-open', open),
  )

  return { card, converterOpen, notice, state, showItem, dismiss, togglePin, showNotice }
})
