<script setup lang="ts">
import { computed } from 'vue'
import { formatAmount, type PriceIndex } from '../../shared/pricing/ninja'
import type { CurrencyId } from '../../shared/settings'
import CurrencyIcon from './CurrencyIcon.vue'

const props = defineProps<{ divine: number; prices: PriceIndex; order: readonly CurrencyId[] }>()

// The big number is the first currency in the user's order worth at least 1, so cheap items
// read "3 Ex" rather than "0.0046 Div".
const parts = computed(() => {
  const all = props.order
    .filter((c) => props.prices.rates[c] > 0)
    .map((c) => ({ c, value: props.prices.fromDivine(props.divine, c) }))
  const lead = Math.max(
    0,
    all.findIndex((p) => p.value >= 1),
  )
  return [all[lead], ...all.filter((_, i) => i !== lead)]
    .filter(Boolean)
    .map((p) => ({ c: p.c, amount: formatAmount(p.value) }))
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
    <span
      v-for="(p, i) in parts"
      :key="p.c"
      class="inline-flex items-center gap-1"
      :class="i === 0 ? 'text-lg font-semibold text-amber-200' : 'text-sm text-neutral-200'"
    >
      {{ p.amount }}
      <CurrencyIcon :id="p.c" :size="i === 0 ? 24 : 18" />
    </span>
  </div>
</template>
