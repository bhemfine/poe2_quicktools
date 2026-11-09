export type ItemKind = 'waystone' | 'tablet' | 'gear' | 'unique' | 'commodity' | 'gem' | 'other'

export type ModType =
  | 'implicit'
  | 'explicit'
  | 'rune'
  | 'enchant'
  | 'corrupted'
  | 'desecrated'
  | 'fractured'
  | 'crafted'

export interface StatLine {
  /** Line as shown in game with rolls collapsed, e.g. "+143 to Evasion Rating". */
  text: string
  /** Original clipboard line. */
  raw: string
  /** Rolled numbers in order of appearance (sign kept for "+N"/"-N"). */
  values: number[]
  /** Roll range per value when the advanced text shows it, sorted low→high. */
  ranges: Array<[number, number] | null>
  unscalable: boolean
}

export interface ParsedMod {
  type: ModType
  generation?: 'prefix' | 'suffix'
  name?: string
  tier?: number
  tags: string[]
  lines: StatLine[]
}

export interface HeaderProperty {
  key: string
  /** Display value as printed, e.g. "+34%". */
  value: string
  /** Numeric part, when there is one. */
  number?: number
  augmented: boolean
}

export interface ParsedItem {
  itemClass: string
  rarity: string
  /** Rare/unique name line (absent for normal/magic/currency). */
  name?: string
  /** The base/type line as printed (magic items include their affixes here). */
  typeLine: string
  kind: ItemKind
  itemLevel?: number
  quality?: number
  stack?: { current: number; max?: number }
  requirements?: { level?: number; str?: number; dex?: number; int?: number }
  sockets?: string
  /** Every "Key: value" line from property sections (armour, waystone header, …). */
  properties: HeaderProperty[]
  waystone?: { tier: number }
  tablet?: { usesRemaining?: number; mechanic?: string }
  mods: ParsedMod[]
  flags: {
    corrupted: boolean
    twiceCorrupted: boolean
    unidentified: boolean
    mirrored: boolean
    sanctified: boolean
    fractured: boolean
    unmodifiable: boolean
  }
  note?: string
  /** True when `{ … Modifier … }` headers were present (Ctrl+Alt+C copy). */
  advanced: boolean
  /** Lines the parser could not place. Shown as "N lines not recognised". */
  unparsed: string[]
}
