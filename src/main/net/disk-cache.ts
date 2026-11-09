import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

interface Entry<T> {
  fetchedAt: number
  hash: string
  data: T
}

/** JSON files under `<userData>/cache`, written atomically. */
export class DiskCache {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  get<T>(key: string, maxAgeMs: number, now = Date.now()): Entry<T> | null {
    const e = this.read<T>(key)
    return e && now - e.fetchedAt < maxAgeMs ? e : null
  }

  /** Stale entries are still useful when the network is down. */
  getStale<T>(key: string): Entry<T> | null {
    return this.read<T>(key)
  }

  set<T>(key: string, data: T, now = Date.now()): Entry<T> {
    const entry: Entry<T> = { fetchedAt: now, hash: hashOf(data), data }
    const file = this.file(key)
    writeFileSync(`${file}.tmp`, JSON.stringify(entry))
    renameSync(`${file}.tmp`, file)
    return entry
  }

  private read<T>(key: string): Entry<T> | null {
    try {
      return JSON.parse(readFileSync(this.file(key), 'utf8')) as Entry<T>
    } catch {
      return null
    }
  }

  private file(key: string): string {
    return join(this.dir, `${key.replace(/[^a-z0-9-]/gi, '_')}.json`)
  }
}

export function hashOf(data: unknown): string {
  return createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 12)
}
