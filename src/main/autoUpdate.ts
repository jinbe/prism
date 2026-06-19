import { autoUpdater } from 'electron-updater'

// Auto-update via electron-updater, pulling published releases from the
// Moravec-Pty-Ltd/prism GitHub releases (the publish config in package.json is
// baked into app-update.yml at build time, so no provider wiring is needed here).
//
// Only runs in a packaged build: in dev there's no app-update.yml and the
// running version is always "the source", so update checks are meaningless.
export function initAutoUpdate(): void {
  autoUpdater.autoDownload = true
  // Installing on quit is the least disruptive default: the download happens in
  // the background and the new version is in place on next launch.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    // Never surface update failures as crashes — a missing release feed or no
    // network shouldn't interrupt the app.
    console.error('[autoUpdate]', err?.message ?? err)
  })

  void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
}
