import type { QuickToolsBridge } from '../shared/ipc'

/** The preload bridge. The only way the renderer talks to the main process. */
export const api: QuickToolsBridge = window.quicktools
