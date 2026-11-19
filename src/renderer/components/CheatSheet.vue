<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HotkeyAction } from '../../shared/hotkeys/actions'
import { displayCombo } from '../../shared/hotkeys/keys'
import type { CheatSheetPosition } from '../../shared/settings'
import { useSettingsStore } from '../stores/settings'

/** In-game reminder of the current hotkeys. Click-through, except while being dragged in mouse mode. */
const settingsStore = useSettingsStore()

// Plain words for players: "price window" is the popup that F2/Ctrl+D opens.
const ROWS: Array<[HotkeyAction, string, string]> = [
  ['price-check', 'Price check', 'Hover an item, then press'],
  ['converter-hud', 'Currency converter', 'Opens or closes it'],
  ['dismiss', 'Close', 'Closes the price window or converter'],
  [
    'toggle-interactive',
    'Mouse mode',
    'Use its filters and buttons, or drag this list. Again = back to game',
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

const PLACE: Record<Exclude<CheatSheetPosition, 'custom'>, string> = {
  left: 'left-3 top-1/2 -translate-y-1/2',
  right: 'right-3 top-1/2 -translate-y-1/2',
  'top-left': 'left-3 top-24',
  'top-right': 'right-3 top-24',
  'bottom-left': 'left-3 bottom-48',
  'bottom-right': 'right-3 bottom-48',
}

// Dragging works only in mouse mode; the rest of the time the list never takes the mouse.
const props = withDefaults(defineProps<{ draggable?: boolean; scale?: number }>(), {
  draggable: false,
  scale: 100,
})
const el = ref<HTMLElement | null>(null)
/** Live position (px) while dragging; null when following the saved setting. */
const dragPos = ref<{ left: number; top: number } | null>(null)
let grab: { dx: number; dy: number } | null = null

const custom = computed(() => {
  const s = settingsStore.settings
  return s.cheatSheetPosition === 'custom' && s.cheatSheetOffset ? s.cheatSheetOffset : null
})
const place = computed(() =>
  dragPos.value || custom.value
    ? ''
    : (PLACE[settingsStore.settings.cheatSheetPosition as keyof typeof PLACE] ?? PLACE.left),
)
const style = computed(() => {
  if (dragPos.value) return { left: `${dragPos.value.left}px`, top: `${dragPos.value.top}px` }
  if (custom.value) return { left: `${custom.value.x * 100}%`, top: `${custom.value.y * 100}%` }
  return {}
})

function clamp(left: number, top: number): { left: number; top: number } {
  const r = el.value?.getBoundingClientRect()
  const maxLeft = Math.max(0, window.innerWidth - (r?.width ?? 0))
  const maxTop = Math.max(0, window.innerHeight - (r?.height ?? 0))
  return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) }
}

function onPointerDown(e: PointerEvent): void {
  if (!props.draggable || !el.value) return
  const r = el.value.getBoundingClientRect()
  grab = { dx: e.clientX - r.left, dy: e.clientY - r.top }
  dragPos.value = { left: r.left, top: r.top }
  el.value.setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!grab) return
  dragPos.value = clamp(e.clientX - grab.dx, e.clientY - grab.dy)
}

function onPointerUp(): void {
  if (!grab || !dragPos.value) return
  grab = null
  const { left, top } = dragPos.value
  void settingsStore
    .update({
      cheatSheetPosition: 'custom',
      cheatSheetOffset: { x: left / window.innerWidth, y: top / window.innerHeight },
    })
    .finally(() => (dragPos.value = null))
}
</script>

<template>
  <aside
    ref="el"
    class="fixed rounded-lg border bg-neutral-950/80 px-2.5 py-2 text-xs text-neutral-200 shadow-lg"
    :class="[
      place,
      draggable
        ? 'pointer-events-auto cursor-grab border-dashed border-sky-300/70 active:cursor-grabbing'
        : 'pointer-events-none border-amber-300/25',
    ]"
    :style="style"
    aria-label="QuickTools hotkeys"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div :style="{ zoom: scale / 100 }">
      <div class="mb-1 flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase">
        <span class="text-amber-300/80">QuickTools keys</span>
        <span v-if="draggable" class="tracking-normal text-sky-300 normal-case"
          >✥ Drag to move</span
        >
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
    </div>
  </aside>
</template>
