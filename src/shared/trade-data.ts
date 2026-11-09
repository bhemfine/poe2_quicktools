import type { TradeFilters, TradeItems, TradeLeagues, TradeStatic, TradeStats } from './schemas'

/** Everything the renderer needs from trade2's data endpoints. */
export interface TradeData {
  leagues: TradeLeagues
  stats: TradeStats
  items: TradeItems
  filters: TradeFilters
  static: TradeStatic
  version: string
}
