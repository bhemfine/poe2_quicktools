import { EventEmitter } from 'node:events'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { REPO_URL, type UpdateStatus } from '../shared/ipc'
import { compareVersions } from '../shared/version'
import type { Logger } from './logging/logger'
import type { HttpClient } from './net/http'

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
const LATEST_RELEASE_API = 'https://api.github.com/repos/bhemfine/poe2_quicktools/releases/latest'

/**
 * Installer build: downloads new releases from GitHub in the background and installs them when the
 * app quits (or on "Restart now"). Portable build: cannot replace itself, so it only checks the
 * latest release and offers a download link. The feed is `publish` in electron-builder.yml.
 */
export class Updater extends EventEmitter<{ status: [UpdateStatus] }> {
  private status: UpdateStatus = { state: 'disabled', reason: 'Not started' }
  private timer?: NodeJS.Timeout
  private enabled = false
  private wired = false
  private readonly portable = !!process.env['PORTABLE_EXECUTABLE_FILE']

  constructor(
    private logger: Logger,
    private http: HttpClient,
  ) {
    super()
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  setEnabled(enabled: boolean): void {
    clearInterval(this.timer)
    this.enabled = app.isPackaged && enabled
    if (!app.isPackaged) return this.set({ state: 'disabled', reason: 'Development build' })
    if (!enabled) return this.set({ state: 'disabled', reason: 'Turned off' })
    void this.check()
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  async check(): Promise<void> {
    if (!this.enabled) return
    // A downloaded update waits for quit; checking again would only download it again.
    if (this.status.state === 'ready' || this.status.state === 'downloading') return
    if (this.portable) return this.checkPortable()
    this.wireAutoUpdater()
    try {
      await electronUpdater.autoUpdater.checkForUpdates()
    } catch (e) {
      // Usually already reported through the 'error' event.
      if (this.status.state === 'checking') this.fail(e)
    }
  }

  /** Quits and runs the downloaded installer, then restarts the app. */
  installNow(): void {
    if (this.status.state !== 'ready') return
    electronUpdater.autoUpdater.quitAndInstall(true, true)
  }

  private wireAutoUpdater(): void {
    if (this.wired) return
    this.wired = true
    const u = electronUpdater.autoUpdater
    u.autoDownload = true
    u.autoInstallOnAppQuit = true
    u.logger = {
      info: (m: unknown) => this.logger.info('updater', String(m)),
      warn: (m: unknown) => this.logger.warn('updater', String(m)),
      error: (m: unknown) =>
        /No published versions/i.test(String(m))
          ? this.logger.info('updater', 'no published release yet')
          : this.logger.error('updater', String(m)),
      debug: () => {},
    }
    u.on('checking-for-update', () => this.set({ state: 'checking' }))
    u.on('update-not-available', () => this.set({ state: 'up-to-date', checkedAt: Date.now() }))
    u.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 }),
    )
    u.on('download-progress', (p) => {
      if (this.status.state === 'downloading')
        this.set({ ...this.status, percent: Math.round(p.percent) })
    })
    u.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version }))
    u.on('error', (e) => this.fail(e))
  }

  private async checkPortable(): Promise<void> {
    this.set({ state: 'checking' })
    try {
      const res = await this.http.request<{ tag_name?: string; html_url?: string }>(
        'GET',
        LATEST_RELEASE_API,
      )
      // 404: no published release yet.
      if (res.status === 404) return this.set({ state: 'up-to-date', checkedAt: Date.now() })
      if (res.status !== 200) throw new Error(`GitHub: HTTP ${res.status}`)
      const tag = res.body.tag_name ?? ''
      if (tag && compareVersions(tag, app.getVersion()) > 0) {
        this.set({
          state: 'available',
          version: tag.replace(/^v/i, ''),
          url: `${REPO_URL}/releases/tag/${encodeURIComponent(tag)}`,
        })
      } else {
        this.set({ state: 'up-to-date', checkedAt: Date.now() })
      }
    } catch (e) {
      this.fail(e)
    }
  }

  private fail(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e)
    // Nothing released yet is not an error for the user.
    if (/No published versions/i.test(message)) {
      return this.set({ state: 'up-to-date', checkedAt: Date.now() })
    }
    this.logger.warn('updater', `update check failed: ${message}`)
    this.set({ state: 'error', message: message.split('\n')[0].slice(0, 200) })
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.emit('status', status)
  }
}
