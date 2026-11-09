import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron'
import { registerIpc } from './ipc'

// The overlay (electron-overlay-window) replaces this window in M1.

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']
const rendererFile = join(__dirname, '../renderer/index.html')
const rendererOrigin = rendererDevUrl ? new URL(rendererDevUrl).origin : 'file://'

function isAppUrl(url: string): boolean {
  if (rendererDevUrl) return new URL(url).origin === rendererOrigin
  return url.startsWith(pathToFileURL(rendererFile).href)
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  return url !== undefined && isAppUrl(url)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // External links open in the default browser; the app never opens new windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })

  if (rendererDevUrl) void win.loadURL(rendererDevUrl)
  else void win.loadFile(rendererFile)

  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  void app.whenReady().then(() => {
    registerIpc(isTrustedSender)
    mainWindow = createWindow()
    mainWindow.on('closed', () => (mainWindow = null))
  })

  app.on('window-all-closed', () => app.quit())
}
