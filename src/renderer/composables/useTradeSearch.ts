import { reactive } from 'vue'
import type { ApiError } from '../../shared/api-result'
import { toListings, type Listing } from '../../shared/pricing/listings'
import { buildQuery, tradeSiteUrl } from '../../shared/query/build'
import type { PriceCheckModel } from '../../shared/query/model'
import { api } from '../bridge'
import { useEconomyStore } from '../stores/economy'

export interface SearchState {
  loading: boolean
  error: ApiError | null
  total: number | null
  listings: Listing[]
  tradeUrl: string | null
}

const LISTING_COUNT = 10

/** One search + one fetch of ≤10 ids per run (PLAN §2.3); stale checks are cancelled in main. */
export function useTradeSearch(checkId: string) {
  const economy = useEconomyStore()
  const state = reactive<SearchState>({
    loading: false,
    error: null,
    total: null,
    listings: [],
    tradeUrl: null,
  })

  async function run(model: PriceCheckModel): Promise<void> {
    state.loading = true
    state.error = null
    try {
      const search = await api.invoke('trade:search', buildQuery(model), checkId)
      if (!search.ok) {
        if (search.error.kind !== 'cancelled') state.error = search.error
        return
      }
      const league = economy.league?.league
      state.total = search.data.total
      state.tradeUrl = league ? tradeSiteUrl(league, search.data.id) : null
      state.listings = []
      const ids = search.data.result.slice(0, LISTING_COUNT)
      if (!ids.length) return
      const fetched = await api.invoke('trade:fetch', ids, search.data.id, checkId)
      if (!fetched.ok) {
        if (fetched.error.kind !== 'cancelled') state.error = fetched.error
        return
      }
      state.listings = toListings(fetched.data, economy.prices)
    } finally {
      state.loading = false
    }
  }

  return { state, run }
}
