import type { PriceCheckModel, PropFilter } from './model'

export interface TradeQuery {
  query: {
    status: { option: string }
    type?: string
    name?: string
    stats: Array<{
      type: 'and' | 'not'
      filters: Array<{ id: string; value?: { min?: number; max?: number }; disabled: false }>
    }>
    filters: Record<string, { filters: Record<string, unknown> }>
  }
  sort: { price: 'asc' }
}

/** Builds the POST body for `/api/trade2/search/poe2/{league}` from the edited model. */
export function buildQuery(model: PriceCheckModel): TradeQuery {
  const q: TradeQuery = {
    query: {
      status: { option: model.onlineOnly ? 'online' : 'any' },
      stats: [],
      filters: {},
    },
    sort: { price: 'asc' },
  }
  if (model.name) q.query.name = model.name
  if (model.type && (model.useBaseType || model.kind !== 'gear')) q.query.type = model.type

  const typeFilters: Record<string, unknown> = {}
  if (model.category && !(model.useBaseType && model.kind === 'gear')) {
    typeFilters.category = { option: model.category }
  }
  if (model.rarity) typeFilters.rarity = { option: model.rarity }
  if (Object.keys(typeFilters).length) q.query.filters.type_filters = { filters: typeFilters }

  for (const p of model.props) {
    if (!p.enabled) continue
    const group = (q.query.filters[p.group] ??= { filters: {} })
    group.filters[p.id] = propValue(p)
  }

  const and = model.stats.filter((s) => s.enabled && s.mode === 'and')
  const not = model.stats.filter((s) => s.enabled && s.mode === 'not')
  if (and.length) {
    q.query.stats.push({
      type: 'and',
      filters: and.map((s) => ({ id: s.id, value: range(s.min, s.max), disabled: false as const })),
    })
  }
  if (not.length) {
    q.query.stats.push({
      type: 'not',
      filters: not.map((s) => ({ id: s.id, disabled: false as const })),
    })
  }
  if (!q.query.stats.length) q.query.stats.push({ type: 'and', filters: [] })
  return q
}

function propValue(p: PropFilter): unknown {
  if (p.option !== undefined) return { option: p.option }
  return range(p.min, p.max) ?? {}
}

function range(min?: number, max?: number): { min?: number; max?: number } | undefined {
  const r: { min?: number; max?: number } = {}
  if (min !== undefined && Number.isFinite(min)) r.min = min
  if (max !== undefined && Number.isFinite(max)) r.max = max
  return Object.keys(r).length ? r : undefined
}

/** Link to the same search on the official trade site. */
export function tradeSiteUrl(league: string, searchId: string): string {
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}/${searchId}`
}
