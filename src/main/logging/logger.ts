import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

const RECENT_LIMIT = 500
const KEEP_FILES = 7

/** Appends to `<logsDir>/YYYY-MM-DD.log` and keeps recent lines for "Copy diagnostics". */
export class Logger {
  private recent: string[] = []

  constructor(private logsDir: string) {
    mkdirSync(logsDir, { recursive: true })
    this.prune()
  }

  debug(scope: string, msg: string): void {
    this.write('debug', scope, msg)
  }
  info(scope: string, msg: string): void {
    this.write('info', scope, msg)
  }
  warn(scope: string, msg: string): void {
    this.write('warn', scope, msg)
  }
  error(scope: string, msg: string, err?: unknown): void {
    const detail =
      err instanceof Error ? `: ${err.stack ?? err.message}` : err ? `: ${String(err)}` : ''
    this.write('error', scope, msg + detail)
  }

  recentLines(): string[] {
    return [...this.recent]
  }

  private write(level: Level, scope: string, msg: string): void {
    const now = new Date()
    const line = `${now.toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`
    this.recent.push(line)
    if (this.recent.length > RECENT_LIMIT) this.recent.shift()
    if (level === 'error' || level === 'warn') console.error(line)
    else console.log(line)
    try {
      appendFileSync(join(this.logsDir, `${now.toISOString().slice(0, 10)}.log`), line + '\n')
    } catch {
      // Logging must never crash the app.
    }
  }

  private prune(): void {
    try {
      const files = readdirSync(this.logsDir)
        .filter((f) => f.endsWith('.log'))
        .sort()
      for (const f of files.slice(0, Math.max(0, files.length - KEEP_FILES))) {
        rmSync(join(this.logsDir, f), { force: true })
      }
    } catch {
      // ignore
    }
  }
}
