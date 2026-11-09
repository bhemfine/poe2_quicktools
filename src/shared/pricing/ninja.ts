import ninjaTypes from '../../../config/ninja-types.json'
import type { NinjaExchange, NinjaItemOverview } from '../schemas'
import type { CurrencyId } from '../settings'

export interface NinjaSnapshot {
  league: string
  leagueSlug: string
  fetchedAt: number
  exchange: Record<string, NinjaExchange>
  uniques: Record<string, NinjaItemOverview>
  /** type → error message for types that failed or returned no lines. */
  errors: Record<string, string>
}

export interface PricePoint {
  name: string
  /** Value in Divine Orbs. */
  divine: number
  /** Traded volume in Divine (exchange) — confidence signal. */
  volume?: number
  listingCount?: number
  /** 7 daily % changes vs 7 days ago. */
  sparkline: Array<number | null>
  totalChange?: number
  /** Change over the last day (difference of the last two sparkline points). */
  change24h?: number
  type: string
  url: string
}

export const LOW_VOLUME_DIVINE = 1

const EXCHANGE_SLUGS = new Map(ninjaTypes.exchange.map((t) => [t.type, t.slug]))
const UNIQUE_SLUGS = new Map(ninjaTypes.uniques.map((t) => [t.type, t.slug]))

/** Lookups and conversions over one poe.ninja snapshot. All prices are in Divine. */
export class PriceIndex {
  private byName = new Map<string, PricePoint>()
  private byId = new Map<string, number>()
  private uniques = new Map<string, PricePoint[]>()
  /** Exalted and Chaos per Divine (poe.ninja `core.rates`). */
  readonly rates: Record<CurrencyId, number>

  constructor(readonly snapshot: NinjaSnapshot) {
    const base = `https://poe.ninja/poe2/economy/${snapshot.leagueSlug}`
    for (const [type, data] of Object.entries(snapshot.exchange)) {
      const lines = new Map(data.lines.map((l) => [l.id, l]))
      for (const item of data.items) {
        const line = lines.get(item.id)
        if (!line) continue
        const spark = line.sparkline?.data ?? []
        this.byId.set(item.id, line.primaryValue)
        this.byName.set(item.name.toLowerCase(), {
          name: item.name,
          divine: line.primaryValue,
          volume: line.volumePrimaryValue ?? undefined,
          sparkline: spark,
          totalChange: line.sparkline?.totalChange ?? undefined,
          change24h: lastChange(spark),
          type,
          url: `${base}/${EXCHANGE_SLUGS.get(type) ?? type.toLowerCase()}/${item.detailsId}`,
        })
      }
    }
    this.byId.set('divine', 1)

    for (const [type, data] of Object.entries(snapshot.uniques)) {
      for (const line of data.lines) {
        const spark = line.sparkLine?.data ?? []
        const point: PricePoint = {
          name: line.name,
          divine: line.primaryValue,
          listingCount: line.listingCount,
          sparkline: spark,
          totalChange: line.sparkLine?.totalChange ?? undefined,
          change24h: lastChange(spark),
          type,
          url: `${base}/${UNIQUE_SLUGS.get(type) ?? type.toLowerCase()}/${line.detailsId}`,
        }
        const key = line.name.toLowerCase()
        this.uniques.set(key, [
          ...(this.uniques.get(key) ?? []),
          { ...point, name: `${line.name}|${line.baseType ?? ''}` },
        ])
      }
    }

    const currency = snapshot.exchange['Currency']
    const vaalDiv = this.byId.get('vaal')
    this.rates = {
      divine: 1,
      exalted:
        currency?.core.rates['exalted'] ??
        (this.byId.get('exalted') ? 1 / this.byId.get('exalted')! : 0),
      chaos:
        currency?.core.rates['chaos'] ?? (this.byId.get('chaos') ? 1 / this.byId.get('chaos')! : 0),
      vaal: vaalDiv ? 1 / vaalDiv : 0,
    }
  }

  findCommodity(name: string): PricePoint | undefined {
    return this.byName.get(name.toLowerCase())
  }

  /** Unique by name; when several bases share a name, prefer the matching base. */
  findUnique(name: string, baseType?: string): PricePoint | undefined {
    const list = this.uniques.get(name.toLowerCase())
    if (!list?.length) return undefined
    const pick =
      list.find((p) => baseType && p.name.endsWith(`|${baseType}`)) ??
      // "Runemastered" and other variants sort after the plain base; take the cheapest otherwise.
      [...list].sort((a, b) => a.divine - b.divine)[0]
    return { ...pick, name }
  }

  /** Divine value of one unit of a trade/ninja currency id ("exalted", "alch"…). */
  divineValueOf(currencyId: string): number | undefined {
    return this.byId.get(currencyId)
  }

  /** Converts a Divine amount into one of the display currencies. */
  fromDivine(divine: number, to: CurrencyId): number {
    return divine * this.rates[to]
  }

  /** Converts any listed price (amount + trade currency id) to Divine. */
  toDivine(amount: number, currencyId: string): number | undefined {
    const v = this.divineValueOf(currencyId)
    return v === undefined ? undefined : amount * v
  }

  /** How many `to` one `from` is worth. */
  rate(from: string, to: string): number | undefined {
    const a = this.divineValueOf(from)
    const b = this.divineValueOf(to)
    return a !== undefined && b ? a / b : undefined
  }

  /** Currencies offered in the converter: everything in the Currency overview. */
  currencies(): Array<{ id: string; name: string }> {
    const items = this.snapshot.exchange['Currency']?.items ?? []
    const out = items.map((i) => ({ id: i.id, name: i.name }))
    if (!out.some((c) => c.id === 'divine')) out.unshift({ id: 'divine', name: 'Divine Orb' })
    return out
  }
}

function lastChange(spark: Array<number | null>): number | undefined {
  const pts = spark.filter((v): v is number => v !== null)
  if (pts.length < 2) return undefined
  return Math.round((pts[pts.length - 1] - pts[pts.length - 2]) * 100) / 100
}

/** "1.23 div", "45 ex" style formatting with sensible precision. */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '?'
  const abs = Math.abs(n)
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 10) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(2)
  if (abs >= 0.01) return n.toFixed(3)
  return n.toPrecision(2)
}

export const CURRENCY_LABEL: Record<CurrencyId, string> = {
  divine: 'Div',
  exalted: 'Ex',
  chaos: 'Chaos',
  vaal: 'Vaal',
}
