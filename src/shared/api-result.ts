export type ApiErrorKind =
  | 'busy'
  | 'cancelled'
  | 'rate-limited'
  | 'invalid-league'
  | 'no-league'
  | 'http'
  | 'schema'
  | 'network'

export interface ApiError {
  kind: ApiErrorKind
  message: string
  /** For `rate-limited`: epoch ms when requests may resume. */
  until?: number
}

/** IPC-safe result: Electron only keeps `message` of thrown errors, so kinds travel as data. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }
