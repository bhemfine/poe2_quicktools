/**
 * zod schemas for every external response. Unknown extra fields are allowed (APIs add fields);
 * missing or mistyped required fields fail validation so schema drift is caught and logged.
 */
import { z } from 'zod'

// ---------------------------------------------------------------- trade2 data

export const tradeLeaguesSchema = z.object({
  result: z
    .array(z.object({ id: z.string(), realm: z.string().optional(), text: z.string() }))
    .min(1),
})

export const tradeStatsSchema = z.object({
  result: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        entries: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })),
      }),
    )
    .min(1),
})

export const tradeItemsSchema = z.object({
  result: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        entries: z.array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            name: z.string().optional(),
            flags: z.object({ unique: z.boolean().optional() }).optional(),
          }),
        ),
      }),
    )
    .min(1),
})

const filterOption = z.object({ id: z.string().nullable(), text: z.string() })
export const tradeFiltersSchema = z.object({
  result: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        filters: z.array(
          z.object({
            id: z.string(),
            text: z.string().optional(),
            minMax: z.boolean().optional(),
            option: z.object({ options: z.array(filterOption) }).optional(),
          }),
        ),
      }),
    )
    .min(1),
})

export const tradeStaticSchema = z.object({
  result: z.array(
    z.object({
      id: z.string(),
      label: z.string().nullable().optional(),
      entries: z.array(
        z.object({ id: z.string(), text: z.string(), image: z.string().optional() }),
      ),
    }),
  ),
})

// ---------------------------------------------------------------- trade2 search / fetch

export const tradeSearchSchema = z.object({
  id: z.string(),
  result: z.array(z.string()),
  total: z.number(),
  complexity: z.number().nullable().optional(),
})

const price = z.object({ amount: z.number(), currency: z.string(), type: z.string().optional() })

export const tradeFetchSchema = z.object({
  result: z.array(
    z
      .object({
        id: z.string(),
        listing: z.object({
          indexed: z.string().optional(),
          whisper: z.string().optional(),
          price: price.nullable().optional(),
          account: z.object({
            name: z.string(),
            online: z
              .object({ league: z.string().optional(), status: z.string().optional() })
              .nullable()
              .optional(),
            lastCharacterName: z.string().optional(),
          }),
        }),
        // Listing cards only use price, seller and whisper. The item itself is not validated:
        // trade2 sends mods as objects, not strings, and checking unused fields only adds ways
        // to break on a patch.
        item: z.record(z.string(), z.unknown()),
      })
      .nullable(),
  ),
})

export type TradeLeagues = z.infer<typeof tradeLeaguesSchema>
export type TradeStats = z.infer<typeof tradeStatsSchema>
export type TradeItems = z.infer<typeof tradeItemsSchema>
export type TradeFilters = z.infer<typeof tradeFiltersSchema>
export type TradeStatic = z.infer<typeof tradeStaticSchema>
export type TradeSearchResult = z.infer<typeof tradeSearchSchema>
export type TradeFetchResult = z.infer<typeof tradeFetchSchema>

// ---------------------------------------------------------------- poe.ninja

export const ninjaIndexStateSchema = z.object({
  economyLeagues: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        displayName: z.string().optional(),
        hardcore: z.boolean().optional(),
        indexed: z.boolean().optional(),
      }),
    )
    .min(1),
})

const sparkline = z.object({
  totalChange: z.number().nullable().optional(),
  data: z.array(z.number().nullable()),
})

export const ninjaExchangeSchema = z.object({
  core: z.object({
    items: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
    rates: z.record(z.string(), z.number()),
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  lines: z.array(
    z.object({
      id: z.string(),
      primaryValue: z.number(),
      volumePrimaryValue: z.number().nullable().optional(),
      maxVolumeCurrency: z.string().nullable().optional(),
      maxVolumeRate: z.number().nullable().optional(),
      sparkline: sparkline.nullable().optional(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      image: z.string().optional(),
      category: z.string().optional(),
      detailsId: z.string(),
    }),
  ),
})

export const ninjaItemOverviewSchema = z.object({
  lines: z.array(
    z.object({
      name: z.string(),
      baseType: z.string().nullable().optional(),
      primaryValue: z.number(),
      listingCount: z.number().optional(),
      corrupted: z.boolean().optional(),
      detailsId: z.string(),
      sparkLine: sparkline.nullable().optional(),
    }),
  ),
})

export type NinjaIndexState = z.infer<typeof ninjaIndexStateSchema>
export type NinjaExchange = z.infer<typeof ninjaExchangeSchema>
export type NinjaItemOverview = z.infer<typeof ninjaItemOverviewSchema>

/** Throws a readable error naming the source and the first failing paths. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const res = schema.safeParse(data)
  if (res.success) return res.data
  const issues = res.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
  throw new SchemaError(`${source}: schema changed (${issues})`)
}

export class SchemaError extends Error {}
