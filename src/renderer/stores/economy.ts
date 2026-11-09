import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { DataStatus } from '../../shared/ipc'
import type { LeagueInfo } from '../../shared/league'
import { PriceIndex } from '../../shared/pricing/ninja'
import type { PolicySnapshot } from '../../shared/ratelimit/limiter'
import { StatMatcher } from '../../shared/stat-match'
import type { TradeData } from '../../shared/trade-data'
import { api } from '../bridge'

/** Trade data, stat matcher, poe.ninja prices, league and rate-limit state, pushed from main. */
export const useEconomyStore = defineStore('economy', () => {
  const trade = shallowRef<TradeData | null>(null)
  const matcher = shallowRef<StatMatcher | null>(null)
  const prices = shallowRef<PriceIndex | null>(null)
  const league = ref<LeagueInfo | null>(null)
  const status = ref<DataStatus>({ trade: 'loading', ninja: 'idle', ninjaErrors: {} })
  const rateLimits = ref<PolicySnapshot[]>([])
  let started = false

  function setTrade(d: TradeData | null): void {
    if (!d || d.version === trade.value?.version) return
    trade.value = d
    // Stat ids or texts changed: rebuild the index.
    matcher.value = new StatMatcher(d.stats.result)
  }

  async function init(): Promise<void> {
    if (started) return
    started = true
    api.on('trade-data', setTrade)
    api.on('ninja-data', (n) => (prices.value = new PriceIndex(n)))
    api.on('league', (l) => (league.value = l))
    api.on('data-status', (s) => (status.value = s))
    api.on('ratelimit', (r) => (rateLimits.value = r))
    const [t, n, l, s, r] = await Promise.all([
      api.invoke('data:get-trade'),
      api.invoke('data:get-ninja'),
      api.invoke('league:get'),
      api.invoke('data:get-status'),
      api.invoke('ratelimit:get'),
    ])
    setTrade(t)
    if (n) prices.value = new PriceIndex(n)
    league.value = l
    status.value = s
    rateLimits.value = r
  }

  const ninjaUpdated = computed(() =>
    status.value.ninjaUpdatedAt
      ? new Date(status.value.ninjaUpdatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  )

  return { trade, matcher, prices, league, status, rateLimits, ninjaUpdated, init }
})
