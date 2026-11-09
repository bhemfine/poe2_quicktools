import { contextBridge, ipcRenderer } from 'electron'
import { isInvokeChannel, type QuickToolsBridge } from '../shared/ipc'

const bridge: QuickToolsBridge = {
  invoke(channel, ...args) {
    if (!isInvokeChannel(channel)) {
      return Promise.reject(new Error(`IPC channel not allow-listed: ${String(channel)}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
}

contextBridge.exposeInMainWorld('quicktools', bridge)
