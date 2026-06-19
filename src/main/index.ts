import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { join } from 'path'
import * as devProxy from './devProxy'
import * as netInspector from './netInspector'
import * as settings from './settings'

// All panes share one persistent session partition so cookies/storage are
// shared — what you usually want for same-session A/B testing. The dev proxy
// is applied to this partition.
export const PANE_PARTITION = 'persist:panes'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: 'Prism',
    backgroundColor: '#1b1712',
    // Frameless on macOS: keep the traffic lights but fuse the title area into
    // our own instrument bar. Other platforms keep their native frame.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open real new-window requests externally rather than as detached windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // In a packaged build the dock/taskbar icon comes from the app bundle. In dev
  // there is no bundle, so set the macOS dock icon at runtime from the source PNG.
  if (process.platform === 'darwin' && !app.isPackaged) {
    const img = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
    if (!img.isEmpty()) app.dock?.setIcon(img)
  }

  ipcMain.handle('devproxy:enable', (_e, cfg: devProxy.ProxyConfig) =>
    devProxy.enable(cfg, PANE_PARTITION)
  )
  ipcMain.handle('devproxy:disable', () => devProxy.disable(PANE_PARTITION))
  ipcMain.handle('devproxy:status', () => devProxy.status())

  ipcMain.handle('netinspect:attach', (_e, { paneId, webContentsId }) =>
    netInspector.attach(paneId, webContentsId)
  )
  ipcMain.handle('netinspect:detach', (_e, paneId: string) => netInspector.detachByPane(paneId))
  ipcMain.handle('netinspect:getBody', (_e, { paneId, requestId }) =>
    netInspector.getBody(paneId, requestId)
  )

  ipcMain.handle('settings:loadProxy', () => settings.loadProxy())
  ipcMain.handle('settings:saveProxy', (_e, s: settings.ProxySettingsSave) => settings.saveProxy(s))
  ipcMain.handle('state:load', () => settings.loadUiState())
  ipcMain.handle('state:save', (_e, s: unknown) => settings.saveUiState(s))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void devProxy.disable(PANE_PARTITION).catch(() => undefined)
})
