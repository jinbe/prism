// Framework-agnostic store + diff logic for the cross-pane network panel.
// The main process streams CDP Network lifecycle events; we assemble them into
// per-pane request records and build a merged, diffed table.

export interface NetEvent {
  paneId: string
  type: 'request' | 'response' | 'finish' | 'fail'
  data: Record<string, unknown>
}

export interface NetRecord {
  requestId: string
  method: string
  url: string
  pathname: string
  resourceType?: string
  status?: number
  mimeType?: string
  size?: number
  startTs?: number
  endTs?: number
  durationMs?: number
  failed?: boolean
  error?: string
  canceled?: boolean
}

export type NetStore = Map<string, Map<string, NetRecord>>

function safePath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + (u.search ? '?…' : '')
  } catch {
    return url.slice(0, 80)
  }
}

export function applyNetEvent(store: NetStore, ev: NetEvent): void {
  let pane = store.get(ev.paneId)
  if (!pane) {
    pane = new Map()
    store.set(ev.paneId, pane)
  }
  const d = ev.data
  const id = d.requestId as string
  switch (ev.type) {
    case 'request':
      pane.set(id, {
        requestId: id,
        method: (d.method as string) ?? 'GET',
        url: d.url as string,
        pathname: safePath(d.url as string),
        resourceType: d.resourceType as string | undefined,
        startTs: d.ts as number | undefined
      })
      break
    case 'response': {
      const r = pane.get(id)
      if (r) {
        r.status = d.status as number
        r.mimeType = d.mimeType as string
      }
      break
    }
    case 'finish': {
      const r = pane.get(id)
      if (r) {
        r.size = d.size as number
        r.endTs = d.ts as number
        if (r.startTs != null) r.durationMs = ((d.ts as number) - r.startTs) * 1000
      }
      break
    }
    case 'fail': {
      const r = pane.get(id)
      if (r) {
        r.failed = true
        r.error = d.error as string
        r.canceled = d.canceled as boolean
        r.endTs = d.ts as number
        if (r.startTs != null) r.durationMs = ((d.ts as number) - r.startTs) * 1000
      }
      break
    }
  }
}

export interface RowCell {
  count: number
  status?: number
  size: number
  failed: boolean
  url: string
  requestId: string
}

export interface Row {
  key: string
  method: string
  path: string
  cells: Record<string, RowCell>
  diff: boolean
}

/**
 * Merge per-pane requests into rows keyed by "METHOD pathname". A row is marked
 * `diff` when the panes disagree: a request missing in some pane, or different
 * status / failure across panes.
 */
export function buildRows(store: NetStore, paneIds: string[], _tick?: number): Row[] {
  const rows = new Map<string, Row>()
  for (const pid of paneIds) {
    const recs = store.get(pid)
    if (!recs) continue
    for (const r of recs.values()) {
      const key = `${r.method} ${r.pathname}`
      let row = rows.get(key)
      if (!row) {
        row = { key, method: r.method, path: r.pathname, cells: {}, diff: false }
        rows.set(key, row)
      }
      const cell = row.cells[pid] ?? {
        count: 0,
        size: 0,
        failed: false,
        status: undefined,
        url: r.url,
        requestId: r.requestId
      }
      cell.count++
      cell.size += r.size ?? 0
      if (r.status != null) cell.status = r.status
      cell.failed = cell.failed || !!r.failed
      cell.url = r.url
      cell.requestId = r.requestId
      row.cells[pid] = cell
    }
  }

  const out: Row[] = []
  for (const row of rows.values()) {
    const present = paneIds.filter((p) => row.cells[p])
    let diff = present.length !== paneIds.length
    if (!diff) {
      const statuses = new Set(present.map((p) => row.cells[p].status))
      const fails = new Set(present.map((p) => row.cells[p].failed))
      if (statuses.size > 1 || fails.size > 1) diff = true
    }
    row.diff = diff
    out.push(row)
  }
  // Differences first, then alphabetical by path.
  out.sort((a, b) => Number(b.diff) - Number(a.diff) || a.path.localeCompare(b.path))
  return out
}

export function formatBytes(n: number): string {
  if (!n) return '0'
  const u = ['B', 'kB', 'MB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${u[i]}`
}
