import { app } from 'electron'
import { QuickToolsApp } from './app'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.bhemfine.poe2quicktools')
  let instance: QuickToolsApp | undefined

  app.on('second-instance', () => instance?.focusExisting())

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  void app.whenReady().then(() => {
    instance = new QuickToolsApp()
    instance.start()
  })

  // The overlay is hidden, not closed, when the game is not running; quit only from the tray.
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => instance?.stop())
}
