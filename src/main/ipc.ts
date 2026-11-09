import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  isInvokeChannel,
  type EventChannel,
  type EventMap,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResult,
} from '../shared/ipc'

export type Handler<C extends InvokeChannel> = (
  ...args: InvokeArgs<C>
) => InvokeResult<C> | Promise<InvokeResult<C>>

export type Handlers = { [C in InvokeChannel]: Handler<C> }

/** Registers every invoke handler. Calls from frames outside the app are rejected. */
export function registerIpc(
  handlers: Handlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  for (const channel of Object.keys(handlers) as InvokeChannel[]) {
    if (!isInvokeChannel(channel)) throw new Error(`IPC channel not allow-listed: ${channel}`)
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error(`Untrusted IPC sender for ${channel}`)
      return handler(...args)
    })
  }
}

export function send<C extends EventChannel>(
  targets: Iterable<WebContents | undefined>,
  channel: C,
  payload: EventMap[C],
): void {
  for (const wc of targets) {
    if (wc && !wc.isDestroyed()) wc.send(channel, payload)
  }
}
