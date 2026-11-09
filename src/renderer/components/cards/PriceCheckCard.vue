<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { parseItem } from '../../../shared/parser/parse'
import { buildModel, type PriceCheckModel } from '../../../shared/query/model'
import { api } from '../../bridge'
import { useTradeSearch } from '../../composables/useTradeSearch'
import { useEconomyStore } from '../../stores/economy'
import { useOverlayStore } from '../../stores/overlay'
import { useSettingsStore } from '../../stores/settings'
import PriceTag from '../PriceTag.vue'
import RateLimitMeter from '../RateLimitMeter.vue'
import RawItemCard from '../RawItemCard.vue'
import CommodityPanel from './CommodityPanel.vue'
import FiltersPanel from './FiltersPanel.vue'
import ListingsPanel from './ListingsPanel.vue'
import TabletInfo from './TabletInfo.vue'
import WaystoneInfo from './WaystoneInfo.vue'

const props = defineProps<{ id: number; text: string }>()
const economy = useEconomyStore()
const overlay = useOverlayStore()
const settingsStore = useSettingsStore()

const item = parseItem(props.text)
const matched = computed(() => (economy.matcher ? economy.matcher.matchItem(item) : []))
const model = ref<PriceCheckModel | null>(null)
const search = useTradeSearch(`check-${props.id}`)

const commodity = computed(() =>
  item.kind === 'commodity' ? (economy.prices?.findCommodity(item.typeLine) ?? null) : null,
)
const unique = computed(() =>
  item.kind === 'unique' && item.name
    ? (economy.prices?.findUnique(item.name, item.typeLine) ?? null)
    : null,
)
const ninjaUrl = computed(() => commodity.value?.url ?? unique.value?.url ?? null)
watch(ninjaUrl, (u) => (overlay.ninjaUrl = u), { immediate: true })

const searchable = computed(() => ['waystone', 'tablet', 'gear'].includes(item.kind))
const showLive = ref(false)

function rebuild(): void {
  if (!economy.trade || !economy.matcher) return
  const s = settingsStore.settings
  model.value = buildModel(item, matched.value, {
    filters: economy.trade.filters,
    items: economy.trade.items,
    minRollPercent: s.priceCheck.minRollPercent,
    onlineOnly: s.priceCheck.onlineOnly,
    jackpotMods: s.jackpotMods,
  })
}

function runSearch(): void {
  if (model.value) void search.run(model.value)
}

// Tells main how well this item was understood, once, so it can spot a patch (see PatchHealth).
let reported = false
function reportHealth(): void {
  if (reported || !model.value || !['waystone', 'tablet', 'gear', 'unique'].includes(item.kind))
    return
  reported = true
  void api.invoke('health:report', {
    modLines: matched.value.length,
    unmatched: model.value.unmatched,
    parserError: item.unparsed.some((u) => u.startsWith('(parser error')),
  })
}

function showLiveListings(): void {
  showLive.value = true
  runSearch()
}

onMounted(() => {
  rebuild()
  reportHealth()
  // Auto-search once for items that only have a live price (one search + one fetch).
  if (searchable.value && economy.league?.league) runSearch()
})
watch(
  () => economy.trade?.version,
  (v, old) => {
    if (v && !old) {
      rebuild()
      reportHealth()
      if (searchable.value && economy.league?.league) runSearch()
    }
  },
)

const title = computed(() => item.name ?? item.typeLine)
const subtitle = computed(() => (item.name ? item.typeLine : ''))
const fallbackMessage = computed(() => {
  if (item.kind === 'gem' || item.kind === 'other') return 'This item type is not priced in v1.'
  if (item.kind === 'commodity' && economy.prices && !commodity.value)
    return 'Not found on poe.ninja.'
  if (economy.status.trade === 'error')
    return `Trade data unavailable: ${economy.status.tradeError}`
  return ''
})
</script>

<template>
  <RawItemCard
    v-if="item.kind === 'gem' || item.kind === 'other'"
    :text="text"
    :message="fallbackMessage"
  />
  <div v-else class="qt-card w-[22rem] space-y-2 p-3 text-sm">
    <header>
      <div class="flex items-baseline gap-2">
        <span
          class="font-semibold"
          :class="
            item.rarity === 'Unique'
              ? 'text-orange-300'
              : item.rarity === 'Rare'
                ? 'text-yellow-200'
                : ''
          "
        >
          {{ title }}
        </span>
        <span v-if="item.flags.corrupted" class="text-xs text-red-400">Corrupted</span>
      </div>
      <div class="text-xs text-neutral-400">
        <span v-if="subtitle">{{ subtitle }} · </span>{{ item.itemClass
        }}<span v-if="item.itemLevel"> · ilvl {{ item.itemLevel }}</span>
      </div>
      <div v-if="!item.advanced && searchable" class="text-[11px] text-amber-300">
        Copied without advanced descriptions — mod tiers are missing.
      </div>
      <div v-if="economy.status.health" class="text-[11px] text-amber-300">
        ⚠ {{ economy.status.health }}
      </div>
    </header>

    <!-- Commodities: poe.ninja only -->
    <template v-if="item.kind === 'commodity'">
      <CommodityPanel v-if="commodity" :item="item" :price="commodity" />
      <p v-else class="text-xs text-neutral-400">
        {{ economy.prices ? 'Not found on poe.ninja.' : 'Loading poe.ninja prices…' }}
      </p>
    </template>

    <!-- Uniques: poe.ninja price instantly, live listings on demand -->
    <template v-else-if="item.kind === 'unique'">
      <div v-if="unique && economy.prices" class="space-y-1">
        <PriceTag
          :divine="unique.divine"
          :prices="economy.prices"
          :order="settingsStore.settings.currencyOrder"
        />
        <div class="text-[11px] text-neutral-500">
          poe.ninja<span v-if="unique.listingCount !== undefined"
            >, {{ unique.listingCount }} listed</span
          >
          ·
          <a :href="unique.url" target="_blank" class="text-sky-400 underline">Open on poe.ninja</a>
        </div>
      </div>
      <p v-else class="text-xs text-neutral-400">
        {{ economy.prices ? 'No poe.ninja price.' : 'Loading prices…' }}
      </p>
      <TabletInfo v-if="item.itemClass === 'Tablet'" :item="item" />
      <button
        v-if="!showLive"
        type="button"
        class="rounded bg-sky-700 px-2 py-0.5 text-xs text-white hover:bg-sky-600"
        @click="showLiveListings"
      >
        Live listings
      </button>
      <ListingsPanel v-else :state="search.state" />
    </template>

    <!-- Waystones, tablets, gear: live trade search -->
    <template v-else>
      <WaystoneInfo v-if="item.kind === 'waystone'" :item="item" />
      <TabletInfo v-if="item.kind === 'tablet'" :item="item" />
      <p v-if="!economy.league?.league" class="text-xs text-amber-300">Pick a league to search.</p>
      <FiltersPanel v-if="model" v-model="model" @search="runSearch" />
      <p v-else class="text-xs text-neutral-400">{{ fallbackMessage || 'Loading trade data…' }}</p>
      <ListingsPanel :state="search.state" />
    </template>

    <footer v-if="searchable || showLive" class="border-t border-neutral-800 pt-1">
      <RateLimitMeter />
    </footer>
  </div>
</template>
