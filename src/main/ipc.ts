import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  isInvokeChannel,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResult,
} from '../shared/ipc'
import { GGG_NOTICE, APP_NAME } from '../shared/notices'
import { USER_AGENT } from './net/http'

type Handler<C extends InvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: InvokeArgs<C>
) => InvokeResult<C> | Promise<InvokeResult<C>>

function handle<C extends InvokeChannel>(
  channel: C,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  handler: Handler<C>,
): void {
  if (!isInvokeChannel(channel)) throw new Error(`IPC channel not allow-listed: ${channel}`)
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error(`Untrusted IPC sender for ${channel}`)
    return handler(event, ...(args as InvokeArgs<C>))
  })
}

export function registerIpc(isTrustedSender: (event: IpcMainInvokeEvent) => boolean): void {
  handle('app:get-info', isTrustedSender, () => ({
    name: APP_NAME,
    version: app.getVersion(),
    userAgent: USER_AGENT,
    gggNotice: GGG_NOTICE,
  }))
}
