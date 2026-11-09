// Adapted from Exiled-Exchange-2 main/src/windowing/OverlayWindow.ts, GameWindow.ts and
// OverlayVisibility.ts @ cca30662 (MIT). Modified.
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { BrowserWindow, dialog, screen, shell } from 'electron'
import { OverlayController, OVERLAY_WINDOW_OPTS, type AttachEvent } from 'electron-overlay-window'
import { isAllowedExternalUrl, type OverlayState } from '../../shared/ipc'
import { toWindowSpace, type Point } from '../../shared/geometry'
import type { Logger } from '../logging/logger'

export const GAME_WINDOW_TITLE = 'Path of Exile 2'

interface OverlayEvents {
  state: [OverlayState]
  /** Esc or the toggle key pressed while the overlay has keyboard focus. */
  'overlay-key': ['escape' | 'toggle']
}

/**
 * One transparent, click-through window kept on top of the PoE 2 window by
 * electron-overlay-window. Idle: mouse events pass through to the game (forwarded so the renderer
 * can hit-test cards). Interactive: the overlay really has keyboard focus for typing.
 */
export class OverlayWindow extends EventEmitter<OverlayEvents> {
  readonly window: BrowserWindow
  private state: OverlayState = {
    attached: false,
    gameActive: false,
    interactive: false,
    hasAccess: true,
  }
  private mouseCaptured = false
  /** Canonical toggle-interactive combo, matched in before-input-event while the overlay has focus. */
  toggleKey = ''

  constructor(
    private logger: Logger,
    private isAppUrl: (url: string) => boolean,
  ) {
    super()
    this.window = new BrowserWindow({
      ...OVERLAY_WINDOW_OPTS,
      width: 800,
      height: 600,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    })

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    this.window.webContents.on('will-navigate', (event, url) => {
      if (!this.isAppUrl(url)) event.preventDefault()
    })
    this.window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (input.key === 'Escape') {
        event.preventDefault()
        this.emit('overlay-key', 'escape')
      } else if (this.toggleKey && matchesInput(this.toggleKey, input)) {
        event.preventDefault()
        this.emit('overlay-key', 'toggle')
      }
    })
  }

  attach(): void {
    const events = OverlayController.events as unknown as EventEmitter
    events.on('attach', (e: AttachEvent) => {
      this.logger.info(
        'overlay',
        `attached ${e.width}x${e.height}@${e.x},${e.y} access=${e.hasAccess}`,
      )
      this.update({ attached: true, gameActive: true, hasAccess: e.hasAccess !== false })
      this.applyMouseMode()
      if (e.hasAccess === false) {
        dialog.showErrorBox(
          'PoE 2 window - no access',
          'Path of Exile 2 is running as administrator.\n\nRestart PoE 2 QuickTools as administrator too, or run the game normally.',
        )
      }
    })
    events.on('detach', () => {
      this.logger.info('overlay', 'detached (game closed)')
      this.update({ attached: false, gameActive: false, interactive: false })
    })
    events.on('focus', () => {
      this.update({ gameActive: true, interactive: false })
      // EOW resets to plain click-through on focus; re-enable forwarding for hover hit-tests.
      this.applyMouseMode()
    })
    events.on('blur', () => {
      this.update({ gameActive: false })
    })
    this.window.on('blur', () => {
      if (this.state.interactive) this.update({ interactive: false })
    })
    OverlayController.attachByTitle(this.window, GAME_WINDOW_TITLE)
  }

  getState(): OverlayState {
    return { ...this.state }
  }

  /** Gives the overlay real keyboard focus (typing into inputs). */
  activate(): void {
    if (!this.state.attached || this.state.interactive) return
    this.update({ interactive: true })
    OverlayController.activateOverlay()
  }

  /** Hands keyboard focus back to the game. */
  focusGame(): void {
    if (!this.state.interactive) return
    this.update({ interactive: false })
    OverlayController.focusTarget()
    this.applyMouseMode()
  }

  toggleInteractive(): void {
    if (this.state.interactive) this.focusGame()
    else this.activate()
  }

  /** While idle, capture the mouse only while it is over a card (renderer hit-test). */
  setMouseCapture(capture: boolean): void {
    this.mouseCaptured = capture
    this.applyMouseMode()
  }

  /** Cursor position in this window's DIP space. */
  cursorInWindow(): Point {
    return toWindowSpace(screen.getCursorScreenPoint(), this.window.getBounds())
  }

  private applyMouseMode(): void {
    if (this.window.isDestroyed()) return
    if (this.state.interactive || this.mouseCaptured) this.window.setIgnoreMouseEvents(false)
    else this.window.setIgnoreMouseEvents(true, { forward: true })
  }

  private update(patch: Partial<OverlayState>): void {
    const next = { ...this.state, ...patch }
    if (JSON.stringify(next) === JSON.stringify(this.state)) return
    this.state = next
    this.emit('state', this.getState())
  }
}

function matchesInput(
  combo: string,
  input: { code: string; control: boolean; shift: boolean; alt: boolean },
): boolean {
  let key = input.code
  if (key.startsWith('Key')) key = key.slice(3)
  else if (key.startsWith('Digit')) key = key.slice(5)
  const parts: string[] = []
  if (input.control) parts.push('Ctrl')
  if (input.shift) parts.push('Shift')
  if (input.alt) parts.push('Alt')
  parts.push(key)
  return parts.join(' + ') === combo
}
