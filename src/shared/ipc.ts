/**
 * Typed IPC contract between preload and main. A channel not listed in `INVOKE_CHANNELS` or
 * `EVENT_CHANNELS` is rejected by the preload bridge and never reaches main or the renderer.
 */
import type { ApiResult } from './api-result'
import type { Point } from './geometry'
import type { HotkeyAction } from './hotkeys/actions'
import type { LeagueInfo } from './league'
import type { NinjaSnapshot } from './pricing/ninja'
import type { PolicySnapshot } from './ratelimit/limiter'
import type { TradeFetchResult, TradeSearchResult } from './schemas'
import type { Settings, SettingsPatch } from './settings'
import type { TradeData } from './trade-data'

export interface DataStatus {
  trade: 'loading' | 'ready' | 'error'
  tradeError?: string
  ninja: 'idle' | 'loading' | 'ready' | 'error'
  ninjaUpdatedAt?: number
  ninjaErrors: Record<string, string>
}

export interface AppInfo {
  name: string
  version: string
  userAgent: string
  gggNotice: string
  isPackaged: boolean
}

export type HotkeyStatus = Partial<Record<HotkeyAction, { registered: boolean; error?: string }>>

export interface OverlayState {
  /** The overlay is attached to a PoE 2 window. */
  attached: boolean
  gameActive: boolean
  interactive: boolean
  /** False when PoE 2 runs as administrator and QuickTools does not. */
  hasAccess: boolean
}

export interface ItemTextEvent {
  text: string
  /** Cursor at hotkey press, in the overlay window's DIP space. */
  cursor: Point
  pressedAt: number
}

export interface NoticeEvent {
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface InvokeMap {
  'app:get-info': { args: []; result: AppInfo }
  'settings:get': { args: []; result: Settings }
  'settings:update': { args: [patch: SettingsPatch]; result: Settings }
  'hotkeys:get-status': { args: []; result: HotkeyStatus }
  'hotkeys:is-available': { args: [combo: string]; result: boolean }
  'app:open-logs': { args: []; result: void }
  'overlay:set-mouse-capture': { args: [capture: boolean]; result: void }
  'overlay:activate': { args: []; result: void }
  'overlay:focus-game': { args: []; result: void }
  'overlay:get-state': { args: []; result: OverlayState }
  'overlay:set-card-open': { args: [open: boolean]; result: void }
  'settings:open-window': { args: []; result: void }
  'clipboard:write': { args: [text: string]; result: void }
  'shell:open-external': { args: [url: string]; result: void }
  'diagnostics:copy': { args: []; result: void }
  'data:get-trade': { args: []; result: TradeData | null }
  'data:get-ninja': { args: []; result: NinjaSnapshot | null }
  'data:get-status': { args: []; result: DataStatus }
  'data:refresh': { args: []; result: void }
  'league:get': { args: []; result: LeagueInfo | null }
  'trade:search': {
    args: [query: unknown, checkId: string]
    result: ApiResult<TradeSearchResult>
  }
  'trade:fetch': {
    args: [ids: string[], queryId: string, checkId: string]
    result: ApiResult<TradeFetchResult>
  }
  'ratelimit:get': { args: []; result: PolicySnapshot[] }
}

export interface EventMap {
  'data-status': DataStatus
  'trade-data': TradeData
  'ninja-data': NinjaSnapshot
  league: LeagueInfo
  ratelimit: PolicySnapshot[]
  'item-text': ItemTextEvent
  'item-text-timeout': { pressedAt: number }
  'overlay-state': OverlayState
  hotkey: { action: HotkeyAction }
  'settings-changed': Settings
  'hotkeys-status': HotkeyStatus
  notice: NoticeEvent
}

export type InvokeChannel = keyof InvokeMap
export type InvokeArgs<C extends InvokeChannel> = InvokeMap[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeMap[C]['result']
export type EventChannel = keyof EventMap

export const INVOKE_CHANNELS = [
  'app:get-info',
  'settings:get',
  'settings:update',
  'hotkeys:get-status',
  'hotkeys:is-available',
  'app:open-logs',
  'overlay:set-mouse-capture',
  'overlay:activate',
  'overlay:focus-game',
  'overlay:get-state',
  'overlay:set-card-open',
  'settings:open-window',
  'clipboard:write',
  'shell:open-external',
  'diagnostics:copy',
  'data:get-trade',
  'data:get-ninja',
  'data:get-status',
  'data:refresh',
  'league:get',
  'trade:search',
  'trade:fetch',
  'ratelimit:get',
] as const satisfies readonly InvokeChannel[]

export const EVENT_CHANNELS = [
  'data-status',
  'trade-data',
  'ninja-data',
  'league',
  'ratelimit',
  'item-text',
  'item-text-timeout',
  'overlay-state',
  'hotkey',
  'settings-changed',
  'hotkeys-status',
  'notice',
] as const satisfies readonly EventChannel[]

export function isInvokeChannel(channel: unknown): channel is InvokeChannel {
  return (INVOKE_CHANNELS as readonly unknown[]).includes(channel)
}

export function isEventChannel(channel: unknown): channel is EventChannel {
  return (EVENT_CHANNELS as readonly unknown[]).includes(channel)
}

/** Only these hosts may be opened in the user's browser. */
export const EXTERNAL_HOSTS = ['poe.ninja', 'www.pathofexile.com', 'pathofexile.com']

export function isAllowedExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && EXTERNAL_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

/** Shape of `window.quicktools`, exposed by the preload script. */
export interface QuickToolsBridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  on<C extends EventChannel>(channel: C, listener: (payload: EventMap[C]) => void): () => void
}
