import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { Logger } from './logging/logger'

/**
 * Checks GitHub Releases for a newer installer build (nsis only; the portable exe never
 * auto-updates). The release feed is configured in electron-builder.yml (`publish`).
 */
export function checkForUpdates(logger: Logger): void {
  if (!app.isPackaged) return
  if (process.env['PORTABLE_EXECUTABLE_FILE']) {
    logger.info('updater', 'portable build: auto-update disabled')
    return
  }
  const { autoUpdater } = electronUpdater
  autoUpdater.logger = {
    info: (m: unknown) => logger.info('updater', String(m)),
    warn: (m: unknown) => logger.warn('updater', String(m)),
    error: (m: unknown) => logger.error('updater', String(m)),
    debug: () => {},
  }
  autoUpdater.checkForUpdatesAndNotify().catch((e: unknown) => {
    logger.warn('updater', `update check failed: ${e instanceof Error ? e.message : String(e)}`)
  })
}
