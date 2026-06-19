// Injected into every <webview> pane. This is the interaction-mirroring engine:
// it captures user interactions and reports them to the host renderer, and it
// replays interactions that the renderer forwards from other panes.
//
// Communication uses webview <-> host messaging:
//   - ipcRenderer.sendToHost(...) -> fires "ipc-message" on the <webview> element
//   - ipcRenderer.on('replay-event', ...) <- host calls webview.send('replay-event', ...)
import { ipcRenderer } from 'electron'

interface PaneEvent {
  type: 'scroll' | 'click' | 'key' | 'input'
  data: Record<string, unknown>
  t: number
}

// While we are replaying an incoming event, suppress capture so the replayed
// interaction doesn't echo back out and cause an infinite loop between panes.
let suppress = false
function withSuppress(fn: () => void): void {
  suppress = true
  try {
    fn()
  } finally {
    // Release on the next tick, after any synchronous events have fired.
    setTimeout(() => {
      suppress = false
    }, 0)
  }
}

function emit(type: PaneEvent['type'], data: Record<string, unknown>): void {
  if (suppress) return
  ipcRenderer.sendToHost('pane-event', { type, data, t: Date.now() } as PaneEvent)
}

// ---------------------------------------------------------------- capture ----

// Scroll mirroring is the jittery one. Two fixes:
//  - Coalesce capture to one emit per animation frame (raw scroll fires far
//    faster than 60Hz and floods IPC / the other panes).
//  - Guard echoes by POSITION, not time: a programmatic scrollTo (from a replay)
//    fires its own async scroll event, which used to slip past the time-based
//    suppress and feed back, so the panes fought each other. We remember the
//    ratio we last applied and skip re-emitting when we're still sitting on it.
let scrollRaf = 0
let lastAppliedX = -1
let lastAppliedY = -1

window.addEventListener(
  'scroll',
  () => {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      // Still resting where a replay put us: this is the echo, drop it. Compare
      // in pixels (not ratios) so the guard holds on short/narrow pages too,
      // where a ratio epsilon would be larger than a whole pixel.
      if (
        Math.abs(window.scrollX - lastAppliedX) <= 1 &&
        Math.abs(window.scrollY - lastAppliedY) <= 1
      )
        return
      const doc = document.documentElement
      const maxX = Math.max(1, doc.scrollWidth - window.innerWidth)
      const maxY = Math.max(1, doc.scrollHeight - window.innerHeight)
      // Send ratios, not pixels, so scroll maps correctly across different
      // viewport sizes (mobile vs desktop).
      emit('scroll', { rx: window.scrollX / maxX, ry: window.scrollY / maxY })
    })
  },
  { passive: true, capture: true }
)

window.addEventListener(
  'click',
  (e) => {
    const me = e as MouseEvent
    emit('click', {
      nx: me.clientX / window.innerWidth,
      ny: me.clientY / window.innerHeight,
      selector: cssPath(me.target as Element)
    })
  },
  true
)

window.addEventListener(
  'keydown',
  (e) => {
    const ke = e as KeyboardEvent
    emit('key', {
      key: ke.key,
      code: ke.code,
      alt: ke.altKey,
      ctrl: ke.ctrlKey,
      meta: ke.metaKey,
      shift: ke.shiftKey
    })
  },
  true
)

window.addEventListener(
  'input',
  (e) => {
    const t = e.target as HTMLInputElement | null
    if (t && 'value' in t) emit('input', { selector: cssPath(t), value: t.value })
  },
  true
)

// ----------------------------------------------------------------- replay ----

ipcRenderer.on('replay-event', (_evt, msg: PaneEvent) => {
  // Scroll uses the position guard (above), not the time-based suppress, because
  // scrollTo's echo event fires async and would outlive the suppress window.
  if (msg.type === 'scroll') {
    applyScroll(msg)
    return
  }
  withSuppress(() => applyEvent(msg))
})

function applyScroll(msg: PaneEvent): void {
  const d = msg.data
  const doc = document.documentElement
  const maxX = Math.max(1, doc.scrollWidth - window.innerWidth)
  const maxY = Math.max(1, doc.scrollHeight - window.innerHeight)
  window.scrollTo({ left: (d.rx as number) * maxX, top: (d.ry as number) * maxY })
  // scrollTo updates scrollX/Y synchronously; record the landed pixel position
  // so the async echo scroll event it triggers is recognised and dropped.
  lastAppliedX = window.scrollX
  lastAppliedY = window.scrollY
}

function applyEvent(msg: PaneEvent): void {
  const d = msg.data
  switch (msg.type) {
    case 'click': {
      // Prefer the selector (robust across responsive layouts); fall back to the
      // element at the normalized coordinates.
      let el = d.selector
        ? (document.querySelector(d.selector as string) as HTMLElement | null)
        : null
      if (!el) {
        el = document.elementFromPoint(
          (d.nx as number) * window.innerWidth,
          (d.ny as number) * window.innerHeight
        ) as HTMLElement | null
      }
      el?.click()
      break
    }
    case 'key': {
      const el = (document.activeElement as HTMLElement) || document.body
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: d.key as string,
          code: d.code as string,
          altKey: d.alt as boolean,
          ctrlKey: d.ctrl as boolean,
          metaKey: d.meta as boolean,
          shiftKey: d.shift as boolean,
          bubbles: true
        })
      )
      break
    }
    case 'input': {
      const el = d.selector
        ? (document.querySelector(d.selector as string) as HTMLInputElement | null)
        : null
      if (el && 'value' in el) {
        el.value = d.value as string
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      break
    }
  }
}

// Build a reasonably stable CSS selector for an element (id wins; otherwise
// nth-of-type chain up to a few levels).
function cssPath(el: Element | null): string {
  if (!el || el.nodeType !== 1) return ''
  const parts: string[] = []
  let node: Element | null = el
  while (node && node.nodeType === 1 && parts.length < 6) {
    let sel = node.nodeName.toLowerCase()
    if (node.id) {
      sel += `#${CSS.escape(node.id)}`
      parts.unshift(sel)
      break
    }
    const parent: Element | null = node.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.nodeName === node!.nodeName)
      if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(node) + 1})`
    }
    parts.unshift(sel)
    node = node.parentElement
  }
  return parts.join(' > ')
}
