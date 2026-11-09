import { version } from '../../../package.json'
import { APP_NAME, CONTACT_EMAIL } from '../../shared/notices'

export function buildUserAgent(appVersion: string): string {
  return `${APP_NAME}/${appVersion} (contact: ${CONTACT_EMAIL})`
}

/** The only User-Agent sent to GGG and poe.ninja (PLAN §1.4). */
export const USER_AGENT = buildUserAgent(version)

export interface HttpResponse<T = unknown> {
  status: number
  header: (name: string) => string | null
  body: T
}

export interface HttpClient {
  request<T = unknown>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<HttpResponse<T>>
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message)
  }
}

/** Minimal surface of Electron's `session.fetch`, so this file stays testable without Electron. */
type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * All web requests go through here, from the main process, with the QuickTools User-Agent and a
 * persistent session (Cloudflare cookies survive restarts). No POESESSID in v1.
 */
export class ElectronHttpClient implements HttpClient {
  constructor(private fetchFn: FetchLike) {}

  async request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<HttpResponse<T>> {
    const res = await this.fetchFn(url, {
      method,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      if (res.ok) throw new HttpError(res.status, url, `Invalid JSON from ${new URL(url).host}`)
    }
    return { status: res.status, header: (n) => res.headers.get(n), body: json as T }
  }
}
