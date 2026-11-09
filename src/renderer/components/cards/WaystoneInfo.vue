<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedItem } from '../../../shared/parser/types'
import { effectivenessBreakdown } from '../../../shared/pricing/listings'

const props = defineProps<{ item: ParsedItem }>()

const effectiveness = computed(
  () => props.item.properties.find((p) => p.key === 'Monster Effectiveness')?.number,
)
const b = computed(() =>
  effectiveness.value !== undefined ? effectivenessBreakdown(effectiveness.value) : null,
)
</script>

<template>
  <div class="space-y-1 text-xs">
    <div class="flex flex-wrap gap-x-3 text-neutral-300">
      <span v-for="p in item.properties" :key="p.key"
        >{{ p.key }}: <b>{{ p.value }}</b></span
      >
    </div>
    <div
      v-if="b"
      class="text-neutral-400"
      title="From the in-game keyword text. Stacking across sources is not verified."
    >
      +{{ effectiveness }}% effectiveness → ~{{ b.toughness }}% more toughness (monsters take ≈
      {{ (b.damageTakenFactor * 100).toFixed(0) }}% of damage), ~{{ b.experience }}% more XP, ~{{
        b.quantity
      }}% more item quantity <span class="text-neutral-500">(approx.)</span>
    </div>
  </div>
</template>
