import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { isEventChannel, isInvokeChannel, type QuickToolsBridge } from '../shared/ipc'

const bridge: QuickToolsBridge = {
  invoke(channel, ...args) {
    if (!isInvokeChannel(channel)) {
      return Promise.reject(new Error(`IPC channel not allow-listed: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel, listener) {
    if (!isEventChannel(channel)) throw new Error(`IPC event not allow-listed: ${String(channel)}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown) =>
      listener(payload as Parameters<typeof listener>[0])
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('quicktools', bridge)
