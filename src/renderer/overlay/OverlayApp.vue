<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../bridge'
import FloatingCard from '../components/FloatingCard.vue'
import RawItemCard from '../components/RawItemCard.vue'
import { useMouseCapture } from '../composables/useMouseCapture'
import { useOverlayStore } from '../stores/overlay'
import type { Settings } from '../../shared/settings'

/** Quick-peek cards close when the cursor moves this far (DIP) from where the hotkey was pressed. */
const DISMISS_DISTANCE = 160

const store = useOverlayStore()
const settings = ref<Settings | null>(null)
const unsubscribe: Array<() => void> = []

useMouseCapture()

function onMouseMove(e: MouseEvent): void {
  const card = store.card
  if (!card || card.pinned || store.state.interactive) return
  if ((e.target as Element | null)?.closest?.('[data-capture]')) return
  const dist = Math.hypot(e.clientX - card.anchor.x, e.clientY - card.anchor.y)
  if (dist > DISMISS_DISTANCE) store.dismiss()
}

/** Focusing a text input gives the overlay real keyboard focus; blurring hands it back. */
function onFocusIn(e: FocusEvent): void {
  if (isTextInput(e.target)) void api.invoke('overlay:activate')
}

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement
    ? !['checkbox', 'radio', 'button'].includes(t.type)
    : t instanceof HTMLTextAreaElement
}

onMounted(async () => {
  settings.value = await api.invoke('settings:get')
  store.state = await api.invoke('overlay:get-state')
  unsubscribe.push(
    api.on('item-text', (e) => store.showItem(e)),
    api.on('item-text-timeout', () =>
      store.showNotice({
        level: 'warn',
        message: "Couldn't read item. Hover an item and try again.",
      }),
    ),
    api.on('overlay-state', (s) => {
      store.state = s
      if (!s.interactive && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }),
    api.on('settings-changed', (s) => (settings.value = s)),
    api.on('notice', (n) => store.showNotice(n)),
    api.on('hotkey', ({ action }) => {
      if (action === 'dismiss') store.dismiss()
      else if (action === 'pin-card') store.togglePin()
      else if (action === 'converter-hud') store.converterOpen = !store.converterOpen
    }),
  )
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('focusin', onFocusIn)
})

onBeforeUnmount(() => {
  unsubscribe.forEach((u) => u())
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('focusin', onFocusIn)
})
</script>

<template>
  <div class="h-screen w-screen select-none">
    <FloatingCard
      v-if="store.card"
      :key="store.card.id"
      :anchor="store.card.anchor"
      :scale="settings?.uiScale ?? 100"
    >
      <div class="relative">
        <RawItemCard :text="store.card.text" />
        <div class="mt-1 flex items-center gap-2 px-1 text-xs text-neutral-300">
          <button type="button" class="underline" @click="store.togglePin()">
            {{ store.card.pinned ? 'Unpin' : 'Pin' }}
          </button>
          <button type="button" class="underline" @click="store.dismiss()">Close</button>
          <input
            class="ml-auto w-28 rounded bg-neutral-800 px-1 py-0.5"
            placeholder="type test…"
            aria-label="Typing test"
          />
        </div>
      </div>
    </FloatingCard>

    <div
      v-if="store.notice"
      data-capture
      class="qt-card fixed top-4 left-1/2 -translate-x-1/2 px-3 py-2 text-sm"
      :class="store.notice.level === 'error' ? 'text-red-300' : 'text-amber-200'"
    >
      {{ store.notice.message }}
    </div>
  </div>
</template>
