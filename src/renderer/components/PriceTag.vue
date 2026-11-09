<script setup lang="ts">
import { computed } from 'vue'
import { CURRENCY_LABEL, formatAmount, type PriceIndex } from '../../shared/pricing/ninja'
import type { CurrencyId } from '../../shared/settings'

const props = defineProps<{ divine: number; prices: PriceIndex; order: readonly CurrencyId[] }>()

const parts = computed(() =>
  props.order
    .filter((c) => props.prices.rates[c] > 0)
    .map((c) => ({
      c,
      label: CURRENCY_LABEL[c],
      amount: formatAmount(props.prices.fromDivine(props.divine, c)),
    })),
)
</script>

<template>
  <div class="flex flex-wrap gap-x-3 gap-y-0.5">
    <span
      v-for="(p, i) in parts"
      :key="p.c"
      :class="i === 0 ? 'text-base font-semibold text-amber-200' : 'text-neutral-300'"
    >
      {{ p.amount }} <span class="text-xs text-neutral-400">{{ p.label }}</span>
    </span>
  </div>
</template>
