import { parseRules, type RateWindow } from '../../src/shared/ratelimit/policy'
import type { Response } from '../../src/shared/ratelimit/limiter'

/**
 * Enforces GGG's rules the way the real server does: every request counts, exceeding a window
 * returns 429 and locks the policy for that window's restrict time. Any 429 here means the client
 * broke the zero-429 design.
 */
export class MockTradeServer {
  rules: Record<string, RateWindow[]> = {
    'trade-search-request-limit': parseRules('5:10:60,15:60:300,30:300:1800,600:21600:3600'),
    'trade-fetch-request-limit': parseRules('12:4:10,16:12:300,50:300:300,1000:21600:1800'),
  }
  hits: Record<string, number[]> = {}
  lockedUntil: Record<string, number> = {}
  sent: Record<string, number> = {}
  count429 = 0
  /** Next N responses on a policy are forced to 429 with this Retry-After. */
  force429: Record<string, { times: number; retryAfter: number }> = {}

  constructor(private now: () => number) {}

  handle<T>(policy: string, body: T): Response<T> {
    const now = this.now()
    this.sent[policy] = (this.sent[policy] ?? 0) + 1
    const hits = (this.hits[policy] ??= [])
    hits.push(now)
    const rules = this.rules[policy] ?? []

    const forced = this.force429[policy]
    if (forced && forced.times > 0) {
      forced.times--
      this.lockedUntil[policy] = now + forced.retryAfter * 1000
      return this.response(policy, 429, body, now, forced.retryAfter)
    }
    if ((this.lockedUntil[policy] ?? 0) > now) {
      return this.response(
        policy,
        429,
        body,
        now,
        Math.ceil((this.lockedUntil[policy] - now) / 1000),
      )
    }
    for (const w of rules) {
      const used = hits.filter((t) => t > now - w.period * 1000).length
      if (used > w.limit) {
        this.lockedUntil[policy] = now + w.restrict * 1000
        return this.response(policy, 429, body, now, w.restrict)
      }
    }
    return this.response(policy, 200, body, now)
  }

  private response<T>(
    policy: string,
    status: number,
    body: T,
    now: number,
    retryAfter?: number,
  ): Response<T> {
    if (status === 429) this.count429++
    const rules = this.rules[policy] ?? []
    const hits = this.hits[policy] ?? []
    const lockLeft = Math.max(0, Math.ceil(((this.lockedUntil[policy] ?? 0) - now) / 1000))
    const headers: Record<string, string> = {
      'x-rate-limit-policy': policy,
      'x-rate-limit-rules': 'Ip',
      'x-rate-limit-ip': rules.map((w) => `${w.limit}:${w.period}:${w.restrict}`).join(','),
      'x-rate-limit-ip-state': rules
        .map(
          (w) => `${hits.filter((t) => t > now - w.period * 1000).length}:${w.period}:${lockLeft}`,
        )
        .join(','),
    }
    if (retryAfter !== undefined) headers['retry-after'] = String(retryAfter)
    return { status, header: (n) => headers[n.toLowerCase()] ?? null, body }
  }
}
