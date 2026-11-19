<script setup lang="ts">
import { computed } from 'vue'
import type { HotkeyAction } from '../../shared/hotkeys/actions'
import { displayCombo } from '../../shared/hotkeys/keys'
import type { CheatSheetPosition } from '../../shared/settings'
import { useSettingsStore } from '../stores/settings'

/** In-game reminder of the current hotkeys. Click-through: it never takes the mouse. */
const settingsStore = useSettingsStore()

// Plain words for players: "price window" is the popup that F2/Ctrl+D opens.
const ROWS: Array<[HotkeyAction, string, string]> = [
  ['price-check', 'Price check', 'Hover an item, then press'],
  ['converter-hud', 'Currency converter', 'Opens or closes it'],
  ['dismiss', 'Close', 'Closes the price window or converter'],
  [
    'toggle-interactive',
    'Click the price window',
    'For filters, Search, Whisper. Again = back to game',
  ],
  ['open-ninja', 'Open on poe.ninja', 'The item in the open price window'],
  ['toggle-cheatsheet', 'Hide this list', ''],
]

const rows = computed(() =>
  ROWS.map(([action, label, hint]) => ({
    action,
    label,
    hint,
    keys: displayCombo(settingsStore.settings.hotkeys[action] ?? '')
      .split(' + ')
      .filter(Boolean)
      .map((k) => (k === 'Escape' ? 'Esc' : k)),
  })).filter((r) => r.keys.length),
)

const PLACE: Record<CheatSheetPosition, string> = {
  left: 'left-3 top-1/2 -translate-y-1/2',
  right: 'right-3 top-1/2 -translate-y-1/2',
  'top-left': 'left-3 top-24',
  'top-right': 'right-3 top-24',
  'bottom-left': 'left-3 bottom-48',
  'bottom-right': 'right-3 bottom-48',
}
const place = computed(() => PLACE[settingsStore.settings.cheatSheetPosition] ?? PLACE.left)
</script>

<template>
  <aside
    class="pointer-events-none fixed rounded-lg border border-amber-300/25 bg-neutral-950/80 px-2.5 py-2 text-xs text-neutral-200 shadow-lg"
    :class="place"
    aria-label="QuickTools hotkeys"
  >
    <div class="mb-1 text-[10px] font-bold tracking-widest text-amber-300/80 uppercase">
      QuickTools keys
    </div>
    <ul class="grid max-w-[19rem] grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5">
      <template v-for="r in rows" :key="r.action">
        <li class="flex items-center gap-0.5 self-start whitespace-nowrap">
          <template v-for="(k, i) in r.keys" :key="k">
            <span v-if="i" class="text-neutral-500">+</span>
            <kbd
              class="rounded border border-b-2 border-neutral-600 bg-neutral-800 px-1 py-px font-mono text-[11px] font-bold text-white"
              >{{ k }}</kbd
            >
          </template>
        </li>
        <li class="leading-tight">
          <span class="font-semibold text-neutral-100">{{ r.label }}</span>
          <span v-if="r.hint" class="block text-[10px] text-neutral-400">{{ r.hint }}</span>
        </li>
      </template>
    </ul>
  </aside>
</template>
