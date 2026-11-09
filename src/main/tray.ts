import { Menu, nativeImage, Tray, type NativeImage } from 'electron'

/** 16×16 amber square with a dark border, drawn at runtime so no binary asset is needed. */
function trayIcon(): NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1
      // BGRA
      buf[i] = border ? 0x20 : 0x2b
      buf[i + 1] = border ? 0x20 : 0xb0
      buf[i + 2] = border ? 0x20 : 0xf5
      buf[i + 3] = 0xff
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

export interface TrayActions {
  openSettings: () => void
  openLogs: () => void
  copyDiagnostics: () => void
  quit: () => void
}

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(trayIcon())
  tray.setToolTip('PoE 2 QuickTools')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Settings…', click: actions.openSettings },
      { label: 'Open logs folder', click: actions.openLogs },
      { label: 'Copy diagnostics', click: actions.copyDiagnostics },
      { type: 'separator' },
      { label: 'Quit', click: actions.quit },
    ]),
  )
  tray.on('double-click', actions.openSettings)
  return tray
}

export function notify(tray: Tray | undefined, title: string, content: string): void {
  tray?.displayBalloon({ title, content, iconType: 'info' })
}
