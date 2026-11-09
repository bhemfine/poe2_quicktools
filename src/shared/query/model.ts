// Filter-building ideas from Exiled-Exchange-2 renderer/src/web/price-check/filters/
// create-item-filters.ts and create-stat-filters.ts @ cca30662 (MIT). Rewritten for PoE 2's
// waystone map_filters, tablet uses-remaining pseudo and QuickTools' editable model.
import type { ParsedItem } from '../parser/types'
import type { TradeFilters, TradeItems } from '../schemas'
import type { MatchedLine } from '../stat-match'

export type FilterGroup =
  'type_filters' | 'map_filters' | 'misc_filters' | 'req_filters' | 'equipment_filters'

export interface PropFilter {
  group: FilterGroup
  id: string
  label: string
  enabled: boolean
  /** Item's own value, shown next to the inputs. */
  value?: number
  min?: number
  max?: number
  /** For option filters (corrupted = "true"/"false"). */
  option?: string
}

export interface StatFilter {
  id: string
  /** Trade stat text ("#% increased Pack Size in Map"). */
  text: string
  /** The item's line ("9% increased Pack Size in Map"), or empty for added stats. */
  itemText: string
  enabled: boolean
  /** "not" = exclude listings with this stat (deal-breaker). */
  mode: 'and' | 'not'
  value?: number
  min?: number
  max?: number
  modType?: string
  tier?: number
  jackpot?: boolean
  /** True when the item says "reduced" but the stat is "increased": lower is better. */
  negated?: boolean
}

export interface PriceCheckModel {
  kind: ParsedItem['kind']
  /** Base/type for the `type` field (waystone tier, tablet base, gear base). */
  type?: string
  /** Unique name. */
  name?: string
  /** trade category option, e.g. "armour.chest". */
  category?: string
  /** Search by base type instead of category (gear). */
  useBaseType: boolean
  rarity?: string
  props: PropFilter[]
  stats: StatFilter[]
  onlineOnly: boolean
  /** Lines the matcher could not map (shown as "N lines not recognised"). */
  unmatched: string[]
}

export interface ModelContext {
  filters: TradeFilters
  items: TradeItems
  minRollPercent: number
  onlineOnly: boolean
  jackpotMods: readonly string[]
}

export const USES_REMAINING_STAT = 'pseudo.pseudo_number_of_uses_remaining'

/** Default min: value minus `pct`% of it, rounded toward the weaker side. */
export function defaultMin(value: number, pct: number): number {
  const v = value - Math.abs(value) * (pct / 100)
  return Number.isInteger(value) ? Math.floor(v) : Math.floor(v * 10) / 10
}

/** Normalizes waystone header keys and filter labels so they can be compared. */
export function labelKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\biir\b/g, 'item rarity')
    .replace(/\b(waystone|available)\b/g, '')
    .replace(/[^a-z]/g, '')
}

/** Maps every waystone header property to a `map_filters` id by its live label. */
export function mapFilterIds(filters: TradeFilters): Map<string, { id: string; label: string }> {
  const group = filters.result.find((g) => g.id === 'map_filters')
  const out = new Map<string, { id: string; label: string }>()
  for (const f of group?.filters ?? []) {
    if (f.text && f.minMax) out.set(labelKey(f.text), { id: f.id, label: f.text })
  }
  return out
}

/** Header properties that drive waystone value; checked by default. */
const DEFAULT_ON_WAYSTONE = new Set(['packsize', 'itemrarity', 'dropchance'])

export function buildModel(
  item: ParsedItem,
  matched: MatchedLine[],
  ctx: ModelContext,
): PriceCheckModel {
  const model: PriceCheckModel = {
    kind: item.kind,
    useBaseType: false,
    props: [],
    stats: [],
    onlineOnly: ctx.onlineOnly,
    unmatched: matched.filter((m) => !m.match && !m.consumed).map((m) => m.line.text),
  }
  const pct = ctx.minRollPercent

  if (item.kind === 'waystone') {
    model.type = item.typeLine.replace(/^.*?(Waystone \(Tier \d+\)).*$/, '$1')
    const ids = mapFilterIds(ctx.filters)
    const tier = ids.get(labelKey('Waystone Tier'))
    if (tier && item.waystone) {
      model.props.push({
        group: 'map_filters',
        id: tier.id,
        label: tier.label,
        enabled: true,
        value: item.waystone.tier,
        min: item.waystone.tier,
        max: item.waystone.tier,
      })
    }
    for (const p of item.properties) {
      if (p.number === undefined) continue
      const f = ids.get(labelKey(p.key))
      if (!f || f.id === tier?.id) continue
      model.props.push({
        group: 'map_filters',
        id: f.id,
        label: p.key,
        enabled: DEFAULT_ON_WAYSTONE.has(labelKey(p.key)),
        value: p.number,
        min: defaultMin(p.number, pct),
      })
    }
    pushCorrupted(model, item)
    // Explicit mods are optional for waystones: shown, off by default (use "not" to exclude).
    model.stats = statFilters(matched, pct, ctx, () => false)
  } else if (item.kind === 'tablet') {
    model.type = tabletBase(item.typeLine, ctx.items)
    model.category = 'map.tablet'
    if (item.tablet?.usesRemaining !== undefined) {
      model.stats.push({
        id: USES_REMAINING_STAT,
        text: '# uses remaining (Tablets)',
        itemText: `${item.tablet.usesRemaining} uses remaining`,
        enabled: true,
        mode: 'and',
        value: item.tablet.usesRemaining,
        min: item.tablet.usesRemaining,
      })
    }
    model.stats.push(...statFilters(matched, pct, ctx, (m) => m.mod.type !== 'implicit'))
    pushCorrupted(model, item)
  } else if (item.kind === 'gear') {
    model.type = gearBase(item, ctx.items)
    model.category = categoryFor(item.itemClass, ctx.filters)
    model.useBaseType = item.rarity !== 'Rare' || !model.category
    model.rarity = item.rarity === 'Rare' ? 'nonunique' : undefined
    if (item.itemLevel) {
      model.props.push({
        group: 'type_filters',
        id: 'ilvl',
        label: 'Item Level',
        enabled: false,
        value: item.itemLevel,
        min: item.itemLevel,
      })
    }
    if (item.quality) {
      model.props.push({
        group: 'type_filters',
        id: 'quality',
        label: 'Quality',
        enabled: false,
        value: item.quality,
        min: item.quality,
      })
    }
    pushCorrupted(model, item)
    model.stats = statFilters(
      matched,
      pct,
      ctx,
      (m) =>
        item.rarity === 'Rare' &&
        (m.mod.type === 'explicit' || m.mod.type === 'desecrated' || m.mod.type === 'fractured'),
    )
  } else if (item.kind === 'unique') {
    model.name = item.name
    model.type = item.typeLine
    model.rarity = 'unique'
    pushCorrupted(model, item)
    model.stats = statFilters(matched, pct, ctx, () => false)
  }
  return model
}

function statFilters(
  matched: MatchedLine[],
  pct: number,
  ctx: ModelContext,
  enabledByDefault: (m: MatchedLine) => boolean,
): StatFilter[] {
  const out: StatFilter[] = []
  for (const m of matched) {
    if (!m.match) continue
    const value = m.match.value
    const negated = m.match.negated
    const jackpot = ctx.jackpotMods.includes(m.match.id)
    const f: StatFilter = {
      id: m.match.id,
      text: m.match.text,
      itemText: m.line.text,
      enabled: enabledByDefault(m) || jackpot,
      mode: 'and',
      value,
      modType: m.mod.type,
      tier: m.mod.tier,
      jackpot,
      negated,
    }
    if (value !== undefined) {
      // "reduced X" maps to a negative "increased X" value: the bound goes on max instead.
      if (negated) f.max = -defaultMin(-value, pct)
      else f.min = defaultMin(value, pct)
    }
    out.push(f)
  }
  return out
}

function pushCorrupted(model: PriceCheckModel, item: ParsedItem): void {
  model.props.push({
    group: 'misc_filters',
    id: 'corrupted',
    label: 'Corrupted',
    enabled: true,
    option: item.flags.corrupted ? 'true' : 'false',
  })
}

/**
 * Tablet base from the live item list: handles magic names ("Breeding Breach Tablet") and the
 * legacy "<X> Precursor Tablet" name.
 */
export function tabletBase(typeLine: string, items: TradeItems): string {
  const legacy = typeLine.replace(/ Precursor Tablet$/, ' Tablet')
  const bases = items.result
    .flatMap((g) => g.entries)
    .filter((e) => !e.flags?.unique && / Tablet$/.test(e.type))
    .map((e) => e.type)
  return bases.find((b) => legacy === b || legacy.endsWith(` ${b}`)) ?? legacy
}

/**
 * Base type of a gear item. Rare and normal items print the base on its own line; magic items
 * wrap it in affixes ("Vaporous Prismatic Ring of the Penguin"), so take the longest known base
 * contained in the line.
 */
export function gearBase(item: ParsedItem, items: TradeItems): string {
  if (item.rarity !== 'Magic') return item.typeLine
  let best = ''
  for (const g of items.result) {
    for (const e of g.entries) {
      if (e.flags?.unique || e.type.length <= best.length) continue
      if (item.typeLine.includes(e.type)) best = e.type
    }
  }
  return best || item.typeLine
}

const CLASS_TO_CATEGORY_TEXT: Record<string, string> = {
  Foci: 'Focus',
  Staves: 'Staff',
  Quarterstaves: 'Quarterstaff',
  Gloves: 'Gloves',
  Boots: 'Boots',
  'Body Armours': 'Body Armour',
  Talismans: 'Talisman',
}

/** Maps "Body Armours" → the type_filters category option whose text is "Body Armour". */
export function categoryFor(itemClass: string, filters: TradeFilters): string | undefined {
  const options =
    filters.result
      .find((g) => g.id === 'type_filters')
      ?.filters.find((f) => f.id === 'category')
      ?.option?.options.filter((o): o is { id: string; text: string } => !!o.id) ?? []
  const wanted = [
    CLASS_TO_CATEGORY_TEXT[itemClass],
    itemClass,
    itemClass.replace(/ies$/, 'y'),
    itemClass.replace(/es$/, ''),
    itemClass.replace(/s$/, ''),
  ].filter(Boolean) as string[]
  for (const w of wanted) {
    const hit = options.find((o) => o.text.toLowerCase() === w.toLowerCase())
    if (hit) return hit.id
  }
  return undefined
}
