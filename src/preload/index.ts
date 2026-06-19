import { contextBridge, ipcRenderer } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'

// The built webview preload sits next to this file (out/preload/webview.js).
// The <webview> "preload" attribute needs a file:// URL.
const webviewPreloadUrl = pathToFileURL(join(__dirname, 'webview.js')).href

export interface ProxyConfig {
  host: string
  port: number
}

export interface ProxyStatus {
  enabled: boolean
  host?: string
  port?: number
  ownTunnel?: boolean
  reason?: string
}

export interface NetEventPayload {
  paneId: string
  type: 'request' | 'response' | 'finish' | 'fail'
  data: Record<string, unknown>
}

const api = {
  webviewPreloadUrl,
  devProxy: {
    enable: (cfg: ProxyConfig): Promise<ProxyStatus> => ipcRenderer.invoke('devproxy:enable', cfg),
    disable: (): Promise<ProxyStatus> => ipcRenderer.invoke('devproxy:disable'),
    status: (): Promise<ProxyStatus> => ipcRenderer.invoke('devproxy:status')
  },
  /** Subscribe to proxy status changes (e.g. tunnel drops). Returns an unsubscribe fn. */
  onProxyStatus: (cb: (s: ProxyStatus) => void): (() => void) => {
    const fn = (_e: unknown, s: ProxyStatus): void => cb(s)
    ipcRenderer.on('devproxy:status', fn)
    return () => ipcRenderer.removeListener('devproxy:status', fn)
  },
  netInspect: {
    attach: (paneId: string, webContentsId: number): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('netinspect:attach', { paneId, webContentsId }),
    detach: (paneId: string): Promise<void> => ipcRenderer.invoke('netinspect:detach', paneId),
    getBody: (
      paneId: string,
      requestId: string
    ): Promise<{ body: string; base64Encoded: boolean } | null> =>
      ipcRenderer.invoke('netinspect:getBody', { paneId, requestId })
  },
  /** Subscribe to streamed network events. Returns an unsubscribe fn. */
  onNetEvent: (cb: (ev: NetEventPayload) => void): (() => void) => {
    const fn = (_e: unknown, ev: NetEventPayload): void => cb(ev)
    ipcRenderer.on('netinspect:event', fn)
    return () => ipcRenderer.removeListener('netinspect:event', fn)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
