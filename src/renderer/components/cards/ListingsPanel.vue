<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatAmount } from '../../../shared/pricing/ninja'
import type { Listing } from '../../../shared/pricing/listings'
import type { CurrencyId } from '../../../shared/settings'
import type { SearchState } from '../../composables/useTradeSearch'
import { api } from '../../bridge'
import { useEconomyStore } from '../../stores/economy'
import { useSettingsStore } from '../../stores/settings'
import CurrencyIcon from '../CurrencyIcon.vue'

const props = defineProps<{ state: SearchState }>()
const economy = useEconomyStore()
const settingsStore = useSettingsStore()
const copied = ref<string | null>(null)
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const countdown = computed(() =>
  props.state.error?.until
    ? Math.max(0, Math.ceil((props.state.error.until - now.value) / 1000))
    : 0,
)

/**
 * Comparison column: the first currency in the user's order (Settings → Display) in which the
 * typical listing is worth at least 1, so the numbers stay readable.
 */
const compare = computed<CurrencyId>(() => {
  const values = props.state.listings
    .map((l) => l.divine)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b)
  const median = values[Math.floor(values.length / 2)]
  const prices = economy.prices
  const order = settingsStore.settings.currencyOrder.filter((c) => (prices?.rates[c] ?? 0) > 0)
  if (!prices || median === undefined || !order.length) return order[0] ?? 'divine'
  return order.find((c) => prices.fromDivine(median, c) >= 1) ?? order[0]
})

function compareAmount(l: Listing): string | null {
  if (l.divine === undefined || !economy.prices || l.currency === compare.value) return null
  return formatAmount(economy.prices.fromDivine(l.divine, compare.value))
}

async function copyWhisper(id: string, whisper?: string): Promise<void> {
  if (!whisper) return
  // Whispers only go to the clipboard; QuickTools never sends chat (PLAN §1.4).
  await api.invoke('clipboard:write', whisper)
  copied.value = id
}
</script>

<template>
  <div class="space-y-1 text-xs">
    <div v-if="state.loading" class="text-neutral-400">Searching…</div>
    <div v-else-if="state.error" class="text-red-300">
      {{ state.error.message }}<span v-if="countdown"> ({{ countdown }} s)</span>
    </div>
    <template v-else-if="state.total !== null">
      <div class="text-neutral-400">
        {{ state.total }} listed<span v-if="state.listings.length"> · cheapest first</span>
        <a
          v-if="state.tradeUrl"
          :href="state.tradeUrl"
          target="_blank"
          class="ml-1 text-sky-400 underline"
          >Open on trade site</a
        >
      </div>
      <table v-if="state.listings.length" class="w-full tabular-nums">
        <thead>
          <tr class="text-left text-[11px] text-neutral-500">
            <th class="pr-2 text-right font-normal">Price</th>
            <th class="pr-2 text-right font-normal">
              <span class="inline-flex items-center gap-0.5">
                ≈ <CurrencyIcon :id="compare" :size="14" />
              </span>
            </th>
            <th class="font-normal">Seller</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(l, i) in state.listings"
            :key="l.id"
            class="border-t border-neutral-800"
            :class="i === 0 ? 'bg-amber-400/10' : ''"
          >
            <td class="py-0.5 pr-2 text-right whitespace-nowrap">
              <span class="inline-flex items-center gap-1 text-sm font-semibold text-white">
                {{ l.amount !== undefined ? formatAmount(l.amount) : '?' }}
                <CurrencyIcon v-if="l.currency" :id="l.currency" :size="18" />
              </span>
            </td>
            <td class="pr-2 text-right whitespace-nowrap text-amber-200">
              <span v-if="compareAmount(l)" class="inline-flex items-center gap-1">
                {{ compareAmount(l) }}
                <CurrencyIcon :id="compare" :size="14" />
              </span>
            </td>
            <td class="w-full truncate" :class="l.online ? 'text-green-400' : 'text-neutral-500'">
              {{ l.online ? '●' : '○' }} {{ l.account }}
            </td>
            <td>
              <button
                v-if="l.whisper"
                type="button"
                class="rounded bg-neutral-700 px-1 hover:bg-neutral-600"
                @click="copyWhisper(l.id, l.whisper)"
              >
                {{ copied === l.id ? 'Copied' : 'Whisper' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!economy.prices" class="text-neutral-500">
        Divine values appear once poe.ninja prices load.
      </div>
    </template>
  </div>
</template>
