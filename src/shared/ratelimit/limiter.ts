// Queueing approach informed by Exiled-Exchange-2 renderer/src/web/price-check/trade/RateLimiter.ts
// @ cca30662 (MIT). Rewritten: per-policy windows from live headers, one-slot margin, persisted
// lockouts, cancellation and a bounded queue.
import { parseRules, PolicyState, type HeaderGetter, type WindowUsage } from './policy'

export class BusyError extends Error {
  constructor() {
    super('Busy: too many requests queued')
  }
}
export class CancelledError extends Error {
  constructor() {
    super('Cancelled by a newer price check')
  }
}
export class RateLimitedError extends Error {
  constructor(
    readonly policy: string,
    readonly until: number,
  ) {
    super(`Rate limited on ${policy} until ${new Date(until).toISOString()}`)
  }
}

export interface LimiterStorage {
  load(): Record<string, number>
  save(lockouts: Record<string, number>): void
}

export interface Response<T> {
  status: number
  header: HeaderGetter
  body: T
}

export interface PolicySnapshot {
  policy: string
  windows: WindowUsage[]
  restrictedUntil: number | null
  queued: number
}

interface Task {
  send: () => Promise<Response<unknown>>
  resolve: (r: Response<unknown>) => void
  reject: (e: unknown) => void
  group?: string
}

export interface LimiterOptions {
  /** Max requests waiting per policy before "busy" is returned immediately. */
  maxQueue?: number
  /** Waits longer than this reject with RateLimitedError instead of blocking the card. */
  maxWaitMs?: number
  now?: () => number
  onChange?: (snapshots: PolicySnapshot[]) => void
}

export class RateLimiter {
  private policies = new Map<string, PolicyState>()
  private queues = new Map<string, Task[]>()
  private running = new Set<string>()
  private inFlight = new Map<string, number>()
  private readonly maxQueue: number
  private readonly maxWaitMs: number
  private readonly now: () => number

  constructor(
    seeds: Record<string, string>,
    private storage?: LimiterStorage,
    private opts: LimiterOptions = {},
  ) {
    this.maxQueue = opts.maxQueue ?? 3
    this.maxWaitMs = opts.maxWaitMs ?? 30_000
    this.now = opts.now ?? Date.now
    for (const [name, rules] of Object.entries(seeds)) {
      if (!name.startsWith('_')) this.policies.set(name, new PolicyState(name, parseRules(rules)))
    }
    const saved = storage?.load() ?? {}
    for (const [name, until] of Object.entries(saved)) {
      if (until > this.now()) this.policy(name).lock(until)
    }
  }

  /**
   * Runs `send` under `policy`'s limits. Rejects with BusyError when the queue is full,
   * CancelledError when `cancelGroup` drops it, RateLimitedError while locked out.
   */
  run<T>(policy: string, send: () => Promise<Response<T>>, group?: string): Promise<Response<T>> {
    const state = this.policy(policy)
    const now = this.now()
    if (state.restrictedUntil > now) {
      return Promise.reject(new RateLimitedError(policy, state.restrictedUntil))
    }
    const queue = this.queues.get(policy) ?? []
    this.queues.set(policy, queue)
    if (queue.length >= this.maxQueue) return Promise.reject(new BusyError())

    return new Promise<Response<T>>((resolve, reject) => {
      queue.push({
        send: send as () => Promise<Response<unknown>>,
        resolve: resolve as (r: Response<unknown>) => void,
        reject,
        group,
      })
      this.emit()
      void this.pump(policy)
    })
  }

  /** Drops queued (not yet sent) requests, e.g. from a previous price check. */
  cancelGroup(except?: string): void {
    for (const queue of this.queues.values()) {
      // Mutate in place: a running pump holds a reference to this array.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (except !== undefined && queue[i].group === except) continue
        queue.splice(i, 1)[0].reject(new CancelledError())
      }
    }
    this.emit()
  }

  snapshot(): PolicySnapshot[] {
    const now = this.now()
    return [...this.policies.values()].map((p) => ({
      policy: p.name,
      windows: p.usage(now),
      restrictedUntil: p.restrictedUntil > now ? p.restrictedUntil : null,
      queued: this.queues.get(p.name)?.length ?? 0,
    }))
  }

  private policy(name: string): PolicyState {
    let p = this.policies.get(name)
    if (!p) {
      p = new PolicyState(name)
      this.policies.set(name, p)
    }
    return p
  }

  private async pump(policy: string): Promise<void> {
    if (this.running.has(policy)) return
    this.running.add(policy)
    try {
      const state = this.policy(policy)
      const queue = this.queues.get(policy)!
      while (queue.length) {
        // Until this session has seen the policy's live headers (seeds may be stale), send one
        // request at a time so a tightened limit can never be exceeded by a burst.
        if (!state.confirmed && (this.inFlight.get(policy) ?? 0) > 0) {
          await sleep(50)
          continue
        }
        const wait = state.waitTime(this.now())
        if (wait > 0) {
          if (state.restrictedUntil > this.now() || wait > this.maxWaitMs) {
            const until = Math.max(state.restrictedUntil, this.now() + wait)
            for (const t of queue.splice(0)) t.reject(new RateLimitedError(policy, until))
            break
          }
          await sleep(wait)
          continue
        }
        const task = queue.shift()!
        state.record(this.now())
        this.inFlight.set(policy, (this.inFlight.get(policy) ?? 0) + 1)
        this.emit()
        void this.execute(state, task)
      }
    } finally {
      this.running.delete(policy)
      this.emit()
    }
  }

  private async execute(state: PolicyState, task: Task): Promise<void> {
    try {
      const res = await task.send()
      const now = this.now()
      const restricted = state.applyHeaders(res.header, now)
      if (res.status === 429) {
        const retryAfter = Number(res.header('retry-after'))
        const seconds =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : state.maxRestrict()
        state.lock(now + seconds * 1000)
        this.persist()
        task.reject(new RateLimitedError(state.name, state.restrictedUntil))
        return
      }
      if (restricted) this.persist()
      task.resolve(res)
    } catch (e) {
      task.reject(e)
    } finally {
      this.inFlight.set(state.name, (this.inFlight.get(state.name) ?? 1) - 1)
      this.emit()
    }
  }

  private persist(): void {
    if (!this.storage) return
    const now = this.now()
    const out: Record<string, number> = {}
    for (const p of this.policies.values())
      if (p.restrictedUntil > now) out[p.name] = p.restrictedUntil
    this.storage.save(out)
  }

  private emit(): void {
    this.opts.onChange?.(this.snapshot())
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
