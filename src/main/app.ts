import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  session,
  shell,
  type IpcMainInvokeEvent,
  type Tray,
} from 'electron'
import { toCheckReport } from '../shared/health'
import type { LimiterStorage } from '../shared/ratelimit/limiter'
import type { HotkeyAction } from '../shared/hotkeys/actions'
import { isAllowedExternalUrl, type EventChannel, type EventMap } from '../shared/ipc'
import { isExclusiveFullscreen, parseGameDisplayConfig } from '../shared/game-config'
import { APP_NAME, GGG_NOTICE } from '../shared/notices'
import { HostClipboard } from './clipboard/HostClipboard'
import { pressCopyItemText } from './input/copy-keystroke'
import { HotkeyManager } from './input/HotkeyManager'
import { registerIpc, send, type Handlers } from './ipc'
import { Logger } from './logging/logger'
import { DataService } from './net/data-service'
import { DiskCache } from './net/disk-cache'
import { ElectronHttpClient, USER_AGENT, type HttpClient } from './net/http'
import { RemoteConfigService } from './net/remote-config'
import { OverlayWindow } from './overlay/OverlayWindow'
import { SettingsStore } from './settings/store'
import { createTray, notify } from './tray'
import { Updater } from './updater'

const GAME_NOT_FOUND_AFTER_MS = 15_000

export class QuickToolsApp {
  readonly logger = new Logger(join(app.getPath('userData'), 'logs'))
  readonly settings = new SettingsStore()
  private overlay!: OverlayWindow
  private settingsWindow?: BrowserWindow
  private hotkeys!: HotkeyManager
  private clipboard = new HostClipboard()
  private tray?: Tray
  private lastItemText = ''
  private data!: DataService
  private remoteConfig!: RemoteConfigService
  private updater!: Updater

  private readonly rendererDevUrl = process.env['ELECTRON_RENDERER_URL']
  private readonly rendererFile = join(__dirname, '../renderer/index.html')

  start(): void {
    const s = this.settings.get()
    this.logger.info('app', `${APP_NAME} ${app.getVersion()} starting (${process.platform})`)
    this.clipboard.restore = s.restoreClipboard
    // Currency icons load in the windows from GGG's CDN; they carry the same User-Agent (PLAN §1.4).
    app.userAgentFallback = USER_AGENT

    const http = this.createHttpClient()
    // Not "cache": on Windows that is the same folder as Chromium's own "Cache".
    const cache = new DiskCache(join(app.getPath('userData'), 'data-cache'))

    this.remoteConfig = new RemoteConfigService(http, cache, this.logger)
    this.data = this.createDataService(http, cache)
    this.data.on('status', (st) => this.broadcast('data-status', st))
    this.data.on('trade', (d) => this.broadcast('trade-data', d))
    this.data.on('ninja', (n) => this.broadcast('ninja-data', n))
    this.data.on('league', (l) => this.broadcast('league', l))
    this.data.on('ratelimit', (r) => this.broadcast('ratelimit', r))
    this.data.on('updated', (message) => this.broadcast('notice', { level: 'info', message }))
    this.data.on('health', (warning) => {
      this.broadcast('notice', { level: 'warn', message: warning })
      notify(this.tray, 'PoE 2 QuickTools may need an update', warning)
    })
    void this.data.start()

    let ninjaTypes = JSON.stringify(this.remoteConfig.get().ninjaTypes)
    this.remoteConfig.on('change', (config) => {
      this.broadcast('remote-config', config)
      const next = JSON.stringify(config.ninjaTypes)
      if (next !== ninjaTypes) this.data.onNinjaTypesChanged()
      ninjaTypes = next
    })
    // In development the local config/ files are the ones being edited.
    if (app.isPackaged) this.remoteConfig.start()

    this.updater = new Updater(this.logger, http)
    this.updater.on('status', (st) => {
      this.broadcast('update-status', st)
      if (st.state === 'ready') {
        notify(
          this.tray,
          `Update ${st.version} downloaded`,
          'It installs when you quit QuickTools, or use Settings → Restart now.',
        )
      }
    })

    this.hotkeys = new HotkeyManager(s.hotkeys, this.logger)
    this.hotkeys.setConditions({ devTools: s.devTools })
    this.hotkeys.on('action', (action, combo) => this.onHotkey(action, combo))
    this.hotkeys.on('status', (status) => this.broadcast('hotkeys-status', status))

    registerIpc(this.handlers(), (e) => this.isTrustedSender(e))

    this.overlay = new OverlayWindow(this.logger, (url) => this.isAppUrl(url))
    this.overlay.toggleKey = s.hotkeys['toggle-interactive']
    this.overlay.on('state', (state) => {
      this.hotkeys.setConditions({ gameActive: state.gameActive })
      this.broadcast('overlay-state', state)
    })
    // Esc while typing in the overlay only hands focus back; the Dismiss hotkey closes cards.
    this.overlay.on('overlay-key', (key) => {
      if (key === 'escape') this.overlay.focusGame()
      else this.overlay.toggleInteractive()
    })
    this.load(this.overlay.window, 'overlay')
    this.overlay.attach()

    this.settings.on('change', (next, prev) => {
      this.clipboard.restore = next.restoreClipboard
      if (JSON.stringify(next.hotkeys) !== JSON.stringify(prev.hotkeys)) {
        this.hotkeys.setBindings(next.hotkeys)
        this.overlay.toggleKey = next.hotkeys['toggle-interactive']
      }
      if (next.devTools !== prev.devTools) this.hotkeys.setConditions({ devTools: next.devTools })
      if (next.league !== prev.league) this.data.onSavedLeagueChanged()
      if (next.checkForUpdates !== prev.checkForUpdates)
        this.updater.setEnabled(next.checkForUpdates)
      this.broadcast('settings-changed', next)
    })

    this.tray = createTray({
      openSettings: () => this.openSettingsWindow(),
      openLogs: () => void shell.openPath(join(app.getPath('userData'), 'logs')),
      copyDiagnostics: () => this.copyDiagnostics(),
      quit: () => app.quit(),
    })

    setTimeout(() => void this.checkGameFound(), GAME_NOT_FOUND_AFTER_MS)
    this.updater.setEnabled(s.checkForUpdates)
  }

  stop(): void {
    this.hotkeys?.unregisterAll()
    this.data?.stop()
    this.remoteConfig?.stop()
  }

  private createHttpClient(): HttpClient {
    const net = session.fromPartition('persist:poe2qt-net')
    net.setUserAgent(USER_AGENT)
    return new ElectronHttpClient((url, init) => net.fetch(url, init))
  }

  private createDataService(http: HttpClient, cache: DiskCache): DataService {
    const lockFile = join(app.getPath('userData'), 'ratelimit-lockouts.json')
    const storage: LimiterStorage = {
      load: () => {
        try {
          return JSON.parse(readFileSync(lockFile, 'utf8')) as Record<string, number>
        } catch {
          return {}
        }
      },
      save: (d) => writeFileSync(lockFile, JSON.stringify(d)),
    }
    return new DataService(
      http,
      cache,
      storage,
      this.logger,
      () => this.settings.get().league,
      () => this.remoteConfig.get().ninjaTypes,
    )
  }

  focusExisting(): void {
    this.openSettingsWindow()
  }

  // ---------------------------------------------------------------- hotkeys

  private onHotkey(action: HotkeyAction, combo: string): void {
    switch (action) {
      case 'price-check':
        this.priceCheck(combo)
        break
      case 'toggle-interactive':
        this.overlay.toggleInteractive()
        break
      case 'save-item-text':
        void this.saveItemFixture()
        break
      default:
        this.broadcast('hotkey', { action })
    }
  }

  private priceCheck(combo: string): void {
    if (this.clipboard.isPolling) return
    const pressedAt = Date.now()
    const cursor = this.overlay.cursorInWindow()
    const reading = this.clipboard.readItemText()
    void reading.ready.then(() =>
      pressCopyItemText(combo, this.settings.get().advancedDescriptionsKey),
    )
    reading.text.then(
      (text) => {
        this.lastItemText = text
        this.logger.debug('price-check', `item text in ${Date.now() - pressedAt} ms`)
        this.broadcast('item-text', { text, cursor, pressedAt })
      },
      () => {
        this.logger.warn('price-check', 'no item text on clipboard within 500 ms')
        this.broadcast('item-text-timeout', { pressedAt })
      },
    )
  }

  /** Dev hotkey: saves the last copied item text as a parser fixture. */
  private async saveItemFixture(): Promise<void> {
    if (!this.lastItemText) return
    const dir = app.isPackaged
      ? join(app.getPath('userData'), 'fixtures', 'clipboard')
      : join(app.getAppPath(), 'tests', 'fixtures', 'clipboard')
    const itemClass = /^Item Class: (.+)$/m.exec(this.lastItemText)?.[1] ?? 'item'
    const slug = itemClass.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const file = join(dir, `${slug}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`)
    await mkdir(dir, { recursive: true })
    await writeFile(file, this.lastItemText.replace(/\r\n/g, '\n'))
    this.logger.info('fixtures', `saved ${file}`)
    this.broadcast('notice', { level: 'info', message: `Saved item text to ${file}` })
  }

  // ---------------------------------------------------------------- windows

  openSettingsWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.show()
      this.settingsWindow.focus()
      return
    }
    const win = new BrowserWindow({
      width: 820,
      height: 760,
      title: 'PoE 2 QuickTools – Settings',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      if (!this.isAppUrl(url)) event.preventDefault()
    })
    win.once('ready-to-show', () => win.show())
    this.load(win, 'settings')
    this.settingsWindow = win
  }

  private load(win: BrowserWindow, route: 'overlay' | 'settings'): void {
    if (this.rendererDevUrl) void win.loadURL(`${this.rendererDevUrl}#${route}`)
    else void win.loadFile(this.rendererFile, { hash: route })
  }

  private windows(): BrowserWindow[] {
    return [this.overlay?.window, this.settingsWindow].filter(
      (w): w is BrowserWindow => !!w && !w.isDestroyed(),
    )
  }

  broadcast<C extends EventChannel>(channel: C, payload: EventMap[C]): void {
    send(
      this.windows().map((w) => w.webContents),
      channel,
      payload,
    )
  }

  isAppUrl(url: string): boolean {
    try {
      if (this.rendererDevUrl) return new URL(url).origin === new URL(this.rendererDevUrl).origin
      return url.startsWith(pathToFileURL(this.rendererFile).href)
    } catch {
      return false
    }
  }

  private isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url
    return url !== undefined && this.isAppUrl(url)
  }

  // ---------------------------------------------------------------- misc

  private async checkGameFound(): Promise<void> {
    if (this.overlay.getState().attached) return
    let exclusive = false
    try {
      const ini = await readFile(
        join(app.getPath('documents'), 'My Games', 'Path of Exile 2', 'poe2_production_Config.ini'),
        'utf8',
      )
      exclusive = isExclusiveFullscreen(parseGameDisplayConfig(ini))
    } catch {
      // No config file: the game may not be installed for this user.
    }
    if (exclusive) {
      this.logger.warn('overlay', 'PoE 2 is set to exclusive fullscreen')
      notify(
        this.tray,
        'PoE 2 is in exclusive fullscreen',
        'The overlay cannot draw over exclusive fullscreen. In PoE 2 Options → Graphics, choose "Windowed Fullscreen" or "Windowed".',
      )
    } else {
      this.logger.info('overlay', 'PoE 2 window not found yet')
      notify(
        this.tray,
        'Waiting for Path of Exile 2',
        'QuickTools attaches automatically when the game window opens. Use Windowed or Windowed Fullscreen mode.',
      )
    }
  }

  private copyDiagnostics(): void {
    const lines = [
      `${APP_NAME} ${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${process.getSystemVersion()}`,
      `Overlay: ${JSON.stringify(this.overlay.getState())}`,
      `Hotkeys: ${JSON.stringify(this.hotkeys.getStatus())}`,
      `Data: ${JSON.stringify(this.data.getStatus())}`,
      `Game lists: ${this.remoteConfig.get().source} · Update: ${JSON.stringify(this.updater.getStatus())}`,
      `Settings: ${JSON.stringify({ ...this.settings.get(), customGameBinds: undefined })}`,
      '--- recent log ---',
      ...this.logger.recentLines().slice(-200),
    ]
    void clipboard.writeText(lines.join('\n'))
  }

  private handlers(): Handlers {
    return {
      'app:get-info': () => ({
        name: APP_NAME,
        version: app.getVersion(),
        userAgent: USER_AGENT,
        gggNotice: GGG_NOTICE,
        isPackaged: app.isPackaged,
      }),
      'settings:get': () => this.settings.get(),
      'settings:update': (patch) => this.settings.update(patch),
      'settings:open-window': () => this.openSettingsWindow(),
      'hotkeys:get-status': () => this.hotkeys.getStatus(),
      'hotkeys:is-available': (combo) => this.hotkeys.isAvailable(combo),
      'app:open-logs': async () => {
        await shell.openPath(join(app.getPath('userData'), 'logs'))
      },
      'overlay:set-mouse-capture': (capture) => this.overlay.setMouseCapture(capture),
      'overlay:activate': () => this.overlay.activate(),
      'overlay:focus-game': () => this.overlay.focusGame(),
      'overlay:get-state': () => this.overlay.getState(),
      'overlay:set-card-open': (open) => this.hotkeys.setConditions({ cardOpen: open }),
      'clipboard:write': (text) => clipboard.writeText(text),
      'shell:open-external': async (url) => {
        if (isAllowedExternalUrl(url)) await shell.openExternal(url)
      },
      'diagnostics:copy': () => this.copyDiagnostics(),
      'data:get-trade': () => this.data.getTrade(),
      'data:get-ninja': () => this.data.getNinja(),
      'data:get-status': () => this.data.getStatus(),
      'data:refresh': () => this.data.refresh(),
      'league:get': () => this.data.getLeague(),
      'trade:search': (query, checkId) => this.data.search(query, checkId),
      'trade:fetch': (ids, queryId, checkId) => this.data.fetch(ids, queryId, checkId),
      'ratelimit:get': () => this.data.rateLimits(),
      'health:report': (raw) => {
        const report = toCheckReport(raw)
        if (report) this.data.reportCheck(report)
      },
      'config:get': () => this.remoteConfig.get(),
      'update:get-status': () => this.updater.getStatus(),
      'update:check': () => this.updater.check(),
      'update:install': () => this.updater.installNow(),
    }
  }
}
