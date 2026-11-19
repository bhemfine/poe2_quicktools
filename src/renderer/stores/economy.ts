import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { buildCurrencyInfo, type CurrencyInfo } from '../../shared/currency-info'
import type { DataStatus } from '../../shared/ipc'
import { networkHint } from '../../shared/network-hint'
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

  const currencyInfo = computed<Map<string, CurrencyInfo>>(() =>
    trade.value ? buildCurrencyInfo(trade.value.static) : new Map(),
  )

  /** "14:05", or "18 Nov 14:05" when the prices are from an earlier day (saved copy, offline). */
  const ninjaUpdated = computed(() => {
    const at = status.value.ninjaUpdatedAt
    if (!at) return null
    const d = new Date(at)
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (d.toDateString() === new Date().toDateString()) return time
    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
  })

  /**
   * Why poe.ninja prices can't update right now, in plain words; null when they can.
   * One empty or failed group (e.g. a type poe.ninja doesn't list this league) is not a problem:
   * only a refresh that brought nothing new counts.
   */
  const ninjaProblem = computed(() => {
    if (status.value.ninja !== 'error') return null
    const first = Object.values(status.value.ninjaErrors)[0]
    return networkHint(first) ?? (first ? `poe.ninja: ${first}` : "poe.ninja can't be reached.")
  })

  return {
    trade,
    matcher,
    prices,
    league,
    status,
    rateLimits,
    currencyInfo,
    ninjaUpdated,
    ninjaProblem,
    init,
  }
})
