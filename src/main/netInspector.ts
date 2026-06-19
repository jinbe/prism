// Attaches the Chrome DevTools Protocol "Network" domain to each pane's
// webContents and streams request lifecycle events to the renderer, where they
// are merged into the cross-pane diff table. Also exposes on-demand response
// body fetching for the body-diff detail view.
import { BrowserWindow, webContents } from 'electron'
import type { WebContents } from 'electron'

interface Attachment {
  paneId: string
  wc: WebContents
  onMessage: (event: unknown, method: string, params: Record<string, any>) => void
  onDetach: () => void
}

// keyed by webContentsId
const attachments = new Map<number, Attachment>()
// paneId -> webContentsId, so we can route getResponseBody to the right pane
const paneToWcId = new Map<string, number>()

function broadcast(paneId: string, type: string, data: Record<string, unknown>): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('netinspect:event', { paneId, type, data })
  }
}

export function attach(paneId: string, webContentsId: number): { ok: boolean; reason?: string } {
  const wc = webContents.fromId(webContentsId)
  if (!wc || wc.isDestroyed()) return { ok: false, reason: 'no webContents' }
  if (attachments.has(webContentsId)) return { ok: true } // already attached

  const dbg = wc.debugger
  try {
    if (!dbg.isAttached()) dbg.attach('1.3')
  } catch (err) {
    // Most commonly: DevTools is open on this pane (only one debugger client allowed).
    return { ok: false, reason: (err as Error).message }
  }

  paneToWcId.set(paneId, webContentsId)

  const onMessage = (_event: unknown, method: string, params: Record<string, any>): void => {
    switch (method) {
      case 'Network.requestWillBeSent':
        broadcast(paneId, 'request', {
          requestId: params.requestId,
          url: params.request?.url,
          method: params.request?.method,
          resourceType: params.type,
          ts: params.timestamp
        })
        break
      case 'Network.responseReceived':
        broadcast(paneId, 'response', {
          requestId: params.requestId,
          status: params.response?.status,
          mimeType: params.response?.mimeType
        })
        break
      case 'Network.loadingFinished':
        broadcast(paneId, 'finish', {
          requestId: params.requestId,
          size: params.encodedDataLength,
          ts: params.timestamp
        })
        break
      case 'Network.loadingFailed':
        broadcast(paneId, 'fail', {
          requestId: params.requestId,
          error: params.errorText,
          canceled: params.canceled,
          ts: params.timestamp
        })
        break
    }
  }

  const onDetach = (): void => {
    attachments.delete(webContentsId)
    wc.debugger.removeListener('message', onMessage)
  }

  dbg.on('message', onMessage)
  dbg.once('detach', onDetach)
  attachments.set(webContentsId, { paneId, wc, onMessage, onDetach })

  try {
    void dbg.sendCommand('Network.enable')
  } catch {
    /* ignore */
  }
  return { ok: true }
}

export function detachByPane(paneId: string): void {
  paneToWcId.delete(paneId)
  for (const [id, a] of attachments) {
    if (a.paneId !== paneId) continue
    try {
      if (a.wc.debugger.isAttached()) a.wc.debugger.detach()
    } catch {
      /* ignore */
    }
    attachments.delete(id)
  }
}

/** Fetch a response body on demand (for the body-diff view). */
export async function getBody(
  paneId: string,
  requestId: string
): Promise<{ body: string; base64Encoded: boolean } | null> {
  const wcId = paneToWcId.get(paneId)
  if (wcId == null) return null
  const a = attachments.get(wcId)
  if (!a || !a.wc.debugger.isAttached()) return null
  try {
    const res = (await a.wc.debugger.sendCommand('Network.getResponseBody', { requestId })) as {
      body: string
      base64Encoded: boolean
    }
    return res
  } catch {
    return null
  }
}
