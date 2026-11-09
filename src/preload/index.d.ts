import type { QuickToolsBridge } from '../shared/ipc'

declare global {
  interface Window {
    quicktools: QuickToolsBridge
  }
}

export {}
