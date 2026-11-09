/** What one price check saw, reported by the card so main can spot a patch that broke parsing. */
export interface CheckReport {
  /** Mod lines on the item. */
  modLines: number
  /** Mod lines the stat matcher could not map. */
  unmatched: string[]
  parserError: boolean
}

const WINDOW = 20
/** Fewer lines than this is not enough to tell a patch from one odd item. */
const MIN_LINES = 15
const UNMATCHED_RATIO = 0.2
const PARSER_ERRORS = 3
const SCHEMA_ERRORS = 2

/**
 * Watches recent price checks for the signs of a game patch the app cannot follow on its own:
 * many unrecognised mods, items that fail to parse, or trade responses in a new format.
 */
export class PatchHealth {
  private reports: CheckReport[] = []
  private schemaErrors = 0

  record(report: CheckReport): void {
    this.reports.push(report)
    if (this.reports.length > WINDOW) this.reports.shift()
  }

  recordSchemaError(): void {
    this.schemaErrors++
  }

  /** New trade data arrived: earlier failures may be fixed, so start counting again. */
  reset(): void {
    this.reports = []
    this.schemaErrors = 0
  }

  /** A plain-language warning, or null when everything looks normal. */
  warning(): string | null {
    if (this.schemaErrors >= SCHEMA_ERRORS) {
      return 'The trade site changed its response format, so live prices may be missing. An app update is needed.'
    }
    const parserErrors = this.reports.filter((r) => r.parserError).length
    if (parserErrors >= PARSER_ERRORS) {
      return `${parserErrors} of your last ${this.reports.length} items could not be read. The game was probably patched; an app update is needed.`
    }
    const lines = this.reports.reduce((n, r) => n + r.modLines, 0)
    const unmatched = this.reports.reduce((n, r) => n + r.unmatched.length, 0)
    if (lines >= MIN_LINES && unmatched / lines >= UNMATCHED_RATIO) {
      return `${unmatched} of ${lines} item mods in your last ${this.reports.length} price checks were not recognised, even after re-downloading the game data. The game was probably patched; an app update is needed.`
    }
    return null
  }
}

/** Sanitises a report coming over IPC. */
export function toCheckReport(raw: unknown): CheckReport | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r['modLines'] !== 'number' || !Array.isArray(r['unmatched'])) return null
  return {
    modLines: Math.max(0, Math.min(100, Math.floor(r['modLines']))),
    unmatched: r['unmatched']
      .filter((l): l is string => typeof l === 'string')
      .slice(0, 30)
      .map((l) => l.slice(0, 200)),
    parserError: r['parserError'] === true,
  }
}
