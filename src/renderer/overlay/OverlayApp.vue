<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { api } from '../bridge'
import CheatSheet from '../components/CheatSheet.vue'
import ConverterHud from '../components/ConverterHud.vue'
import FloatingCard from '../components/FloatingCard.vue'
import LeaguePicker from '../components/LeaguePicker.vue'
import PriceCheckCard from '../components/cards/PriceCheckCard.vue'
import { useMouseCapture } from '../composables/useMouseCapture'
import { useEconomyStore } from '../stores/economy'
import { useOverlayStore } from '../stores/overlay'
import { useSettingsStore } from '../stores/settings'

const store = useOverlayStore()
const economy = useEconomyStore()
const settingsStore = useSettingsStore()
const unsubscribe: Array<() => void> = []
const scale = computed(() => settingsStore.settings.uiScale)

useMouseCapture()

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
    // The price window stays open until Esc, Close or the next price check.
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
    api.on('notice', (n) => store.showNotice(n)),
    api.on('hotkey', ({ action }) => {
      if (action === 'dismiss') store.dismiss()
      else if (action === 'converter-hud') store.converterOpen = !store.converterOpen
      else if (action === 'open-ninja' && store.ninjaUrl) {
        void api.invoke('shell:open-external', store.ninjaUrl)
      }
    }),
  )
  window.addEventListener('focusin', onFocusIn)
})

onBeforeUnmount(() => {
  unsubscribe.forEach((u) => u())
  window.removeEventListener('focusin', onFocusIn)
})
</script>

<template>
  <div class="h-screen w-screen select-none">
    <!-- Hidden while a card or the converter is open so it never covers them. -->
    <CheatSheet
      v-if="
        settingsStore.settings.cheatSheet &&
        store.state.attached &&
        !store.card &&
        !store.converterOpen
      "
      :style="{ zoom: scale / 100 }"
    />
    <FloatingCard v-if="store.card" :key="store.card.id" :anchor="store.card.anchor" :scale="scale">
      <div>
        <PriceCheckCard :id="store.card.id" :text="store.card.text" />
        <div
          class="mt-1 flex items-center gap-3 px-1 text-xs text-neutral-300 [text-shadow:0_0_3px_#000]"
        >
          <button type="button" class="underline" @click="store.dismiss()">Close (Esc)</button>
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
