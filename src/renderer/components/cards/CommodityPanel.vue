<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedItem } from '../../../shared/parser/types'
import { formatAmount, LOW_VOLUME_DIVINE, type PricePoint } from '../../../shared/pricing/ninja'
import { useEconomyStore } from '../../stores/economy'
import { useSettingsStore } from '../../stores/settings'
import PriceTag from '../PriceTag.vue'
import PriceSparkline from '../PriceSparkline.vue'

const props = defineProps<{ item: ParsedItem; price: PricePoint }>()
const economy = useEconomyStore()
const settingsStore = useSettingsStore()
const settings = computed(() => settingsStore.settings)

const stack = computed(() => props.item.stack?.current ?? 1)
const lowVolume = computed(
  () => props.price.volume !== undefined && props.price.volume < LOW_VOLUME_DIVINE,
)

function pct(n: number | undefined): string {
  if (n === undefined) return '–'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}
</script>

<template>
  <div v-if="economy.prices" class="space-y-2">
    <PriceTag :divine="price.divine" :prices="economy.prices" :order="settings.currencyOrder" />
    <div v-if="stack > 1" class="text-xs text-neutral-300">
      Stack of {{ stack }}:
      <PriceTag
        class="inline-flex"
        :divine="price.divine * stack"
        :prices="economy.prices"
        :order="settings.currencyOrder"
      />
    </div>
    <div class="flex items-center gap-3 text-xs">
      <PriceSparkline :data="price.sparkline" />
      <span :class="(price.totalChange ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'"
        >7d {{ pct(price.totalChange) }}</span
      >
      <span :class="(price.change24h ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'"
        >24h {{ pct(price.change24h) }}</span
      >
    </div>
    <div class="text-xs" :class="lowVolume ? 'text-amber-300' : 'text-neutral-400'">
      <template v-if="price.volume !== undefined">
        Traded volume: {{ formatAmount(price.volume) }} Div<span v-if="lowVolume">
          — low volume, price may be unreliable</span
        >
      </template>
      <template v-else-if="price.listingCount !== undefined"
        >{{ price.listingCount }} listed</template
      >
    </div>
    <div class="text-[11px] text-neutral-500">
      poe.ninja average<span v-if="economy.ninjaUpdated">, updated {{ economy.ninjaUpdated }}</span>
      · <a :href="price.url" target="_blank" class="text-sky-400 underline">Open on poe.ninja</a>
    </div>
  </div>
</template>
