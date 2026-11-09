<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CURRENCY_LABEL } from '../../shared/pricing/ninja'
import type { CurrencyId } from '../../shared/settings'
import { useEconomyStore } from '../stores/economy'

/** A currency's in-game icon (from GGG's CDN), falling back to its short name. */
const props = withDefaults(defineProps<{ id: string; size?: number }>(), { size: 18 })
const economy = useEconomyStore()
const info = computed(() => economy.currencyInfo.get(props.id))
const label = computed(() => CURRENCY_LABEL[props.id as CurrencyId] ?? info.value?.name ?? props.id)
const failed = ref(false)
watch(
  () => props.id,
  () => (failed.value = false),
)
</script>

<template>
  <img
    v-if="info?.icon && !failed"
    :src="info.icon"
    :alt="label"
    :title="info.name"
    :width="size"
    :height="size"
    class="inline-block shrink-0 align-middle"
    @error="failed = true"
  />
  <span v-else class="text-neutral-400" :title="info?.name">{{ label }}</span>
</template>
