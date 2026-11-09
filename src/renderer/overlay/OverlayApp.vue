<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { api } from '../bridge'
import ConverterHud from '../components/ConverterHud.vue'
import FloatingCard from '../components/FloatingCard.vue'
import LeaguePicker from '../components/LeaguePicker.vue'
import PriceCheckCard from '../components/cards/PriceCheckCard.vue'
import { useMouseCapture } from '../composables/useMouseCapture'
import { useEconomyStore } from '../stores/economy'
import { useOverlayStore } from '../stores/overlay'
import { useSettingsStore } from '../stores/settings'

/** Quick-peek cards close when the cursor moves this far (DIP) from where the hotkey was pressed. */
const DISMISS_DISTANCE = 160

const store = useOverlayStore()
const economy = useEconomyStore()
const settingsStore = useSettingsStore()
const unsubscribe: Array<() => void> = []
const scale = computed(() => settingsStore.settings.uiScale)

useMouseCapture()

function onMouseMove(e: MouseEvent): void {
  const card = store.card
  if (!card || card.pinned || store.state.interactive) return
  if ((e.target as Element | null)?.closest?.('[data-capture]')) return
  const dist = Math.hypot(e.clientX - card.anchor.x, e.clientY - card.anchor.y)
  if (dist > DISMISS_DISTANCE * (scale.value / 100)) store.dismiss()
}

/** Focusing a text input gives the overlay real keyboard focus; Esc or clicking the game hands it back. */
function onFocusIn(e: FocusEvent): void {
  if (isTextInput(e.target)) void api.invoke('overlay:activate')
}

function isTextInput(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement
    ? !['checkbox', 'radio', 'button'].includes(t.type)
    : t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
}

onMounted(async () => {
  await Promise.all([settingsStore.init(), economy.init()])
  store.state = await api.invoke('overlay:get-state')
  unsubscribe.push(
    api.on('item-text', (e) => store.showItem(e, settingsStore.settings.pinCards)),
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
    api.on('notice', (n) => store.showNotice(n)),
    api.on('hotkey', ({ action }) => {
      if (action === 'dismiss') store.dismiss()
      else if (action === 'pin-card') store.togglePin()
      else if (action === 'converter-hud') store.converterOpen = !store.converterOpen
      else if (action === 'open-ninja' && store.ninjaUrl) {
        void api.invoke('shell:open-external', store.ninjaUrl)
      }
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
    <FloatingCard v-if="store.card" :key="store.card.id" :anchor="store.card.anchor" :scale="scale">
      <div>
        <PriceCheckCard :id="store.card.id" :text="store.card.text" />
        <div
          class="mt-1 flex items-center gap-3 px-1 text-xs text-neutral-300 [text-shadow:0_0_3px_#000]"
        >
          <button type="button" class="underline" @click="store.togglePin()">
            {{ store.card.pinned ? 'Unpin' : 'Pin' }}
          </button>
          <button type="button" class="underline" @click="store.dismiss()">Close</button>
          <button
            type="button"
            class="ml-auto underline"
            @click="api.invoke('settings:open-window')"
          >
            Settings
          </button>
        </div>
      </div>
    </FloatingCard>

    <ConverterHud
      v-if="store.converterOpen"
      :style="{ zoom: scale / 100 }"
      @close="store.converterOpen = false"
    />

    <div
      v-if="economy.league?.needsPick && (store.card || store.converterOpen)"
      data-capture
      class="qt-card fixed top-4 left-4 p-3"
    >
      <LeaguePicker />
    </div>

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
