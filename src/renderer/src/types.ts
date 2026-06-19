export interface Pane {
  id: string
  url: string
  /** Logical viewport width in CSS px. */
  width: number
  /** Logical viewport height in CSS px. */
  height: number
  /** Device preset key (see DEVICE_PRESETS) or 'custom'. */
  device: string
  /** Whether this pane participates in interaction mirroring. */
  mirror: boolean
  /** Last URL reported by the pane (for the address bar). */
  currentUrl?: string
}

export interface DevicePreset {
  key: string
  label: string
  width: number
  height: number
  /** Optional user-agent override for mobile emulation. */
  userAgent?: string
}

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const TABLET_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export const DEVICE_PRESETS: DevicePreset[] = [
  { key: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, userAgent: MOBILE_UA },
  { key: 'iphone-15', label: 'iPhone 15', width: 393, height: 852, userAgent: MOBILE_UA },
  { key: 'pixel-8', label: 'Pixel 8', width: 412, height: 915, userAgent: MOBILE_UA },
  { key: 'ipad', label: 'iPad', width: 820, height: 1180, userAgent: TABLET_UA },
  { key: 'laptop', label: 'Laptop', width: 1280, height: 800 },
  { key: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  { key: 'custom', label: 'Custom', width: 800, height: 600 }
]

export function presetByKey(key: string): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.key === key) ?? DEVICE_PRESETS[DEVICE_PRESETS.length - 1]
}

export interface PaneEventMsg {
  type: 'scroll' | 'click' | 'key' | 'input'
  data: Record<string, unknown>
  t: number
}

export interface PaneHandle {
  replay: (msg: PaneEventMsg) => void
  loadURL: (url: string) => void
  reload: () => void
  goBack: () => void
  goForward: () => void
  devtools: () => void
}

export function normalizeUrl(input: string): string {
  const v = input.trim()
  if (!v) return 'about:blank'
  if (/^[a-z]+:\/\//i.test(v) || v.startsWith('about:')) return v
  // localhost / IP / has a dot -> treat as URL, else search.
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/.test(v) || /\.[a-z]{2,}/i.test(v)) {
    return `http://${v}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`
}
