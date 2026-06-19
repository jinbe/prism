/// <reference types="svelte" />
/// <reference types="vite/client" />
import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }

  // Electron's <webview> element + the methods we use (created imperatively).
  interface WebviewTag extends HTMLElement {
    src: string
    loadURL(url: string): void
    reload(): void
    goBack(): void
    goForward(): void
    canGoBack(): boolean
    canGoForward(): boolean
    send(channel: string, ...args: unknown[]): void
    setUserAgent(ua: string): void
    openDevTools(): void
    getURL(): string
    getWebContentsId(): number
    capturePage(): Promise<{ toDataURL(): string; getSize(): { width: number; height: number } }>
  }
}

export {}
