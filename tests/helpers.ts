import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const FIXTURES = join(__dirname, 'fixtures')

/** Seed fixtures plus any real copies captured in-game with the dev hotkey. */
export function loadClipboardFixtures(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const dir of [join(FIXTURES, 'clipboard'), join(FIXTURES, 'clipboard', 'seed')]) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
      out.push([f, readFileSync(join(dir, f), 'utf8')])
    }
  }
  return out
}

export function seed(name: string): string {
  return readFileSync(join(FIXTURES, 'clipboard', 'seed', name), 'utf8')
}

export function apiFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, 'api', name), 'utf8')) as T
}
