/**
 * One GGG rate-limit policy (e.g. `trade-search-request-limit`). Keeps a local log of request
 * times, reconciles it with the server's `-State` headers, and says how long to wait so that no
 * window is ever filled to its limit (one-slot safety margin → zero 429s by design).
 */

export interface RateWindow {
  /** Max hits in the period. */
  limit: number
  /** Period in seconds. */
  period: number
  /** Lockout in seconds when exceeded. */
  restrict: number
}

export interface WindowUsage extends RateWindow {
  used: number
}

/** Parses "5:10:60,15:60:300" (hits:period:restrict). */
export function parseRules(text: string | null | undefined): RateWindow[] {
  if (!text) return []
  return text
    .split(',')
    .map((part) => part.trim().split(':').map(Number))
    .filter((p) => p.length === 3 && p.every((n) => Number.isFinite(n)) && p[0] > 0 && p[1] > 0)
    .map(([limit, period, restrict]) => ({ limit, period, restrict }))
}

/** Parses "-State" values "1:10:0,1:60:0" (current:period:activeRestrictSeconds). */
export function parseState(
  text: string | null | undefined,
): Array<{ hits: number; period: number; restrictLeft: number }> {
  if (!text) return []
  return text
    .split(',')
    .map((part) => part.trim().split(':').map(Number))
    .filter((p) => p.length === 3 && p.every((n) => Number.isFinite(n)))
    .map(([hits, period, restrictLeft]) => ({ hits, period, restrictLeft }))
}

export type HeaderGetter = (name: string) => string | null

export class PolicyState {
  windows: RateWindow[]
  /** True once real headers have been seen for this policy. */
  confirmed = false
  restrictedUntil = 0
  private hits: number[] = []

  constructor(
    readonly name: string,
    seed: RateWindow[] = [],
  ) {
    this.windows = seed
  }

  get known(): boolean {
    return this.windows.length > 0
  }

  record(now: number): void {
    this.hits.push(now)
    this.prune(now)
  }

  used(w: RateWindow, now: number): number {
    const from = now - w.period * 1000
    let n = 0
    for (const t of this.hits) if (t > from) n++
    return n
  }

  /** Milliseconds until one more request may be sent while keeping one slot free in every window. */
  waitTime(now: number): number {
    if (this.restrictedUntil > now) return this.restrictedUntil - now
    let wait = 0
    for (const w of this.windows) {
      const allowed = Math.max(1, w.limit - 1)
      const inWindow = this.hits.filter((t) => t > now - w.period * 1000).sort((a, b) => a - b)
      const excess = inWindow.length + 1 - allowed
      if (excess > 0) {
        // The `excess`-th oldest hit has to age out of this window.
        const t = inWindow[excess - 1] + w.period * 1000 - now + 1
        wait = Math.max(wait, t)
      }
    }
    return wait
  }

  /** Adopts the rules and state the server reports. Returns true if a restriction is active. */
  applyHeaders(get: HeaderGetter, now: number): boolean {
    const ruleNames = (get('x-rate-limit-rules') ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
    if (!ruleNames.length) return false

    const windows: RateWindow[] = []
    let restricted = false
    for (const rule of ruleNames) {
      const rules = parseRules(get(`x-rate-limit-${rule.toLowerCase()}`))
      const state = parseState(get(`x-rate-limit-${rule.toLowerCase()}-state`))
      windows.push(...rules)
      for (const s of state) {
        const w = rules.find((r) => r.period === s.period)
        if (w) this.reconcile(w, s.hits, now)
        if (s.restrictLeft > 0) {
          this.restrictedUntil = Math.max(this.restrictedUntil, now + s.restrictLeft * 1000)
          restricted = true
        }
      }
    }
    if (windows.length) {
      this.windows = windows
      this.confirmed = true
    }
    return restricted
  }

  /** Locks the policy (429 or an active restriction) until `until`. */
  lock(until: number): void {
    this.restrictedUntil = Math.max(this.restrictedUntil, until)
  }

  /** Longest restrict time of any window, used when a 429 arrives without Retry-After. */
  maxRestrict(): number {
    return Math.max(60, ...this.windows.map((w) => w.restrict))
  }

  usage(now: number): WindowUsage[] {
    return this.windows.map((w) => ({ ...w, used: this.used(w, now) }))
  }

  /** The server counts more hits than we logged (other tools, restarts): assume they are recent. */
  private reconcile(w: RateWindow, serverHits: number, now: number): void {
    const local = this.used(w, now)
    for (let i = local; i < serverHits; i++) this.hits.push(now)
  }

  private prune(now: number): void {
    const longest = Math.max(0, ...this.windows.map((w) => w.period)) * 1000
    this.hits = this.hits.filter((t) => t > now - longest)
  }
}
