<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatAmount } from '../../shared/pricing/ninja'
import { useEconomyStore } from '../stores/economy'
import { useSettingsStore } from '../stores/settings'

defineEmits<{ close: [] }>()
const economy = useEconomyStore()
const settingsStore = useSettingsStore()

const amount = ref(1)
const from = ref('divine')
const to = ref('exalted')
const dragFrom = ref<number | null>(null)

const currencies = computed(() => economy.prices?.currencies() ?? [])
const nameOf = (id: string) => currencies.value.find((c) => c.id === id)?.name ?? id
const rate = computed(() => economy.prices?.rate(from.value, to.value))
const result = computed(() => (rate.value !== undefined ? amount.value * rate.value : undefined))
const pairs = computed(() => settingsStore.settings.favouritePairs)

function usePair(p: { from: string; to: string }): void {
  from.value = p.from
  to.value = p.to
}

function swap(): void {
  ;[from.value, to.value] = [to.value, from.value]
}

function pairRate(a: string, b: string): string {
  const r = economy.prices?.rate(a, b)
  return r === undefined ? '?' : formatAmount(r)
}

function savePairs(next: Array<{ from: string; to: string }>): void {
  void settingsStore.update({ favouritePairs: next })
}

function addPair(): void {
  if (pairs.value.some((p) => p.from === from.value && p.to === to.value)) return
  savePairs([...pairs.value, { from: from.value, to: to.value }])
}

function removePair(i: number): void {
  savePairs(pairs.value.filter((_, k) => k !== i))
}

function drop(i: number): void {
  if (dragFrom.value === null || dragFrom.value === i) return
  const next = [...pairs.value]
  const [moved] = next.splice(dragFrom.value, 1)
  next.splice(i, 0, moved)
  dragFrom.value = null
  savePairs(next)
}
</script>

<template>
  <div
    data-capture
    class="qt-card fixed top-16 left-1/2 w-[26rem] -translate-x-1/2 space-y-2 p-3 text-sm"
  >
    <div class="flex items-center">
      <h2 class="font-semibold">Currency converter</h2>
      <button
        type="button"
        class="ml-auto text-neutral-400 hover:text-white"
        aria-label="Close"
        @click="$emit('close')"
      >
        ✕
      </button>
    </div>
    <p v-if="!economy.prices" class="text-xs text-neutral-400">Loading poe.ninja prices…</p>
    <template v-else>
      <div class="flex items-center gap-1">
        <input
          v-model.number="amount"
          type="number"
          min="0"
          step="any"
          class="w-20 rounded bg-neutral-800 px-1"
          aria-label="Amount"
        />
        <select v-model="from" class="flex-1 rounded bg-neutral-800" aria-label="From currency">
          <option v-for="c in currencies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button type="button" class="rounded bg-neutral-700 px-1" title="Swap" @click="swap">
          ⇄
        </button>
        <select v-model="to" class="flex-1 rounded bg-neutral-800" aria-label="To currency">
          <option v-for="c in currencies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="text-lg text-amber-200">
        = {{ result !== undefined ? formatAmount(result) : '?' }}
        <span class="text-sm text-neutral-400">{{ nameOf(to) }}</span>
      </div>
      <div class="flex items-center text-xs">
        <span class="text-neutral-500">Favourites (drag to reorder)</span>
        <button type="button" class="ml-auto text-sky-400 underline" @click="addPair">
          + Add this pair
        </button>
      </div>
      <ul class="space-y-0.5 text-xs">
        <li
          v-for="(p, i) in pairs"
          :key="p.from + p.to"
          draggable="true"
          class="flex cursor-move items-center gap-2 rounded px-1 hover:bg-neutral-800"
          @dragstart="dragFrom = i"
          @dragover.prevent
          @drop="drop(i)"
        >
          <button type="button" class="flex-1 text-left" @click="usePair(p)">
            1 {{ nameOf(p.from) }} = <b>{{ pairRate(p.from, p.to) }}</b> {{ nameOf(p.to) }}
          </button>
          <button
            type="button"
            class="text-neutral-500 hover:text-red-300"
            aria-label="Remove pair"
            @click="removePair(i)"
          >
            ✕
          </button>
        </li>
      </ul>
      <p class="text-[11px] text-neutral-500">
        poe.ninja average<span v-if="economy.ninjaUpdated"
          >, updated {{ economy.ninjaUpdated }}</span
        >
      </p>
    </template>
  </div>
</template>
