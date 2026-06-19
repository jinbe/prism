# Prism

A developer browser built on Electron (real Chromium per pane) with a Svelte UI.
One set of interactions, fanned out across many viewports — built for side-by-side
A/B and responsive testing.

- **Split panes** — any number of Chromium views side by side.
- **Per-pane viewport control** — device presets (iPhone, iPad, Pixel, laptop,
  desktop) or custom width × height, with mobile user-agent emulation.
- **Mirror interactions** — clicks, scrolling, and typing in one pane are replayed
  in the other "synced" panes. Scroll mirrors by ratio and clicks by CSS selector
  (with normalized-coordinate fallback), so it holds up even when mobile and
  desktop layouts differ.
- **Mirror routes** — when one pane navigates, the others follow to the same URL.
  For comparing mobile vs desktop where interactions aren't 1:1.
- **Per-pane DevTools** — the built-in Chrome DevTools, one button per pane.
- **Cross-pane network diff** — the thing stock DevTools can't do: a merged request
  table across all panes, highlighting where they disagree (a request one pane made
  and another didn't, or different status codes). Click a shared request to **diff
  its response body** side by side (syntax-highlighted, via `@pierre/diffs`).
- **Built-in Dev Proxy** — a toggle that tunnels `localhost` to another machine over
  SSH (SOCKS5). This is your `chrome-dev` script, built in.

## Run it

Requires Node 18+ and pnpm.

```bash
pnpm install
pnpm run dev      # launches the app with hot reload
```

Build distributables:

```bash
pnpm run build        # compile main/preload/renderer into out/
pnpm run build:mac    # package a .app/.dmg (also :win, :linux)
pnpm run typecheck    # svelte-check
```

## Dev Proxy — how it maps to `chrome-dev`

Your original script opened a SOCKS5 tunnel with `autossh -D 1080 dev-host`
and launched Chrome with `--proxy-server=socks5://localhost:1080` and
`--proxy-bypass-list="<-loopback>"`. The `<-loopback>` part removes Chromium's
built-in "don't proxy localhost" rule, so `localhost` is resolved on the remote
machine.

The **Dev Proxy** toggle reproduces that exactly (`src/main/devProxy.ts`):

1. If port `1080` isn't already open, it spawns
   `autossh -M 0 -N -C -D 1080 … <host>` (so an existing tunnel — including one
   started by your shell script — is reused).
2. It applies the proxy to the shared pane session:
   `proxyRules: "socks5://127.0.0.1:1080"`, `proxyBypassRules: "<-loopback>"`.

Host and port are configurable in the toolbar (⚙). Default host is
`dev-host`, port `1080`. Turning it off clears the proxy and kills any tunnel
this app started (an externally-started one is left alone). The pill turns green
when active, red with a reason if the tunnel fails (e.g. host unreachable or
`autossh` not installed — `brew install autossh`).

## Architecture

```
src/
  main/
    index.ts         Electron entry; window + IPC wiring.
    devProxy.ts      SSH tunnel lifecycle + per-session SOCKS proxy.
    netInspector.ts  Attaches CDP "Network" to each pane; streams events; fetches bodies.
  preload/
    index.ts         Main-window bridge: window.api (proxy, net inspect, webview preload URL).
    webview.ts       Injected into every pane. Captures interactions and replays
                     forwarded ones. The mirroring engine.
  renderer/          Svelte 5 UI
    src/
      App.svelte               State + pane orchestration + mirror/route forwarding.
      components/Pane.svelte    One Chromium <webview> with viewport sizing + nav.
      components/Toolbar.svelte Global URL, sync toggles, proxy + network controls.
      components/NetworkPanel.svelte  Cross-pane request diff table.
      components/BodyDiff.svelte      Response-body diff (@pierre/diffs).
      netStore.ts              Network event assembly + diff logic.
      types.ts                 Pane model + device presets + URL helper.
```

### How mirroring works

The webview preload (`webview.ts`) captures `scroll` / `click` / `keydown` /
`input` and sends them to the host via `ipcRenderer.sendToHost`. `App.svelte`
receives them on the `<webview>`'s `ipc-message` event and forwards each to the
other synced panes via `webview.send('replay-event', …)`. The preload re-dispatches
them, with a short suppression window so replayed events don't echo back and loop.

### How the network diff works

`netInspector.ts` attaches the Chrome DevTools Protocol `Network` domain to each
pane's `webContents` (via its `webContentsId`) and streams request lifecycle events
to the renderer. `netStore.ts` assembles them into per-pane records and merges them
into rows keyed by `METHOD pathname`; a row is flagged as a difference when the
panes disagree. Clicking a shared row lazily fetches both response bodies through
CDP `Network.getResponseBody` and renders a syntax-highlighted diff.

> Note: opening a pane's built-in DevTools detaches our CDP client from that pane
> (Chromium allows only one debugger per page), so network capture for that pane
> pauses while its DevTools is open.

## Ideas / next steps

- Per-pane proxy (separate partitions) — compare local-direct vs proxied-remote
  in adjacent panes.
- Deeper device emulation via CDP `Emulation.setDeviceMetricsOverride`
  (device-pixel-ratio, touch).
- Header diffing in the body-diff view; "clear on navigate" for the network table.
- Persist layout/presets across restarts.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the
type/build gates, and the hard-won gotchas to avoid regressing. PRs target `main`
and need one approving review before merge.

## License

[MIT](LICENSE) © Jin Chan
