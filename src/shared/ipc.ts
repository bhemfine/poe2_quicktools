/**
 * Typed IPC contract between preload and main. A channel not listed in
 * `INVOKE_CHANNELS` is rejected by the preload bridge and never reaches main.
 */

export interface AppInfo {
  name: string
  version: string
  userAgent: string
  gggNotice: string
}

export interface InvokeMap {
  'app:get-info': { args: []; result: AppInfo }
}

export type InvokeChannel = keyof InvokeMap
export type InvokeArgs<C extends InvokeChannel> = InvokeMap[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeMap[C]['result']

export const INVOKE_CHANNELS = ['app:get-info'] as const satisfies readonly InvokeChannel[]

export function isInvokeChannel(channel: unknown): channel is InvokeChannel {
  return (INVOKE_CHANNELS as readonly unknown[]).includes(channel)
}

/** Shape of `window.quicktools`, exposed by the preload script. */
export interface QuickToolsBridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
}
