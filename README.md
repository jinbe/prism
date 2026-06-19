# Prism

A developer browser for side-by-side A/B and responsive testing. Real Chromium in
every pane (it's Electron), Svelte 5 on top. Drive one pane and the interactions
mirror across the rest.

## What it does

- **Split panes**: any number of Chromium views side by side.
- **Per-pane viewport control**: device presets (iPhone, iPad, Pixel, laptop,
  desktop) or custom width × height, with mobile user-agent emulation.
- **Mirror interactions**: clicks, scrolling, and typing in one pane are replayed
  in the other "synced" panes. Scroll mirrors by ratio and clicks by CSS selector
  (with a normalised-coordinate fallback), so it holds up even when mobile and
  desktop layouts differ.
- **Mirror routes**: when one pane navigates, the others follow to the same URL.
  For comparing mobile vs desktop where interactions aren't 1:1.
- **Per-pane DevTools**: the built-in Chrome DevTools, one button per pane.
- **Cross-pane network diff**: a merged request table across all panes, flagging
  where they disagree (a request one pane made and another didn't, or different
  status codes). Stock DevTools can't do this because each pane is a separate page.
  Click a shared request to diff the response bodies side by side
  (syntax-highlighted, via `@pierre/diffs`).
- **Built-in Dev Proxy**: a toggle that tunnels `localhost` to another machine over
  SSH (SOCKS5). My `chrome-dev` script, built in.

## Run it

Prereqs: Node 18+ and pnpm.

```bash
pnpm install
pnpm run dev      # launches the app with hot reload
```

Build:

```bash
pnpm run build        # compile main/preload/renderer into out/
pnpm run build:mac    # package a .app/.dmg (also :win, :linux)
pnpm run typecheck    # svelte-check
```

Run `pnpm run build` and `pnpm run typecheck` before you push; both should be
clean. `svelte-check` is the type gate (the Vite build doesn't typecheck `.ts`).

Signed, notarized macOS releases are cut by pushing a version tag; see
[RELEASING.md](RELEASING.md).

## Dev Proxy

A `chrome-dev`-style SOCKS5 tunnel, built in (`src/main/devProxy.ts`):

1. If the SOCKS port isn't already open, it spawns
   `autossh -M 0 -N -C -D <port> … <host>`, so an existing tunnel (including one
   started by your own shell script) is reused.
2. It points the shared pane session at `socks5://127.0.0.1:<port>` with
   `proxyBypassRules: "<-loopback>"`. The `<-loopback>` rule removes Chromium's
   built-in "don't proxy localhost" behaviour, so `localhost` resolves on the
   remote host.

Open the settings cog on the **Dev Proxy** chip to set host, SOCKS port, and an
optional username/password. Defaults: host `dev-host`, port `1080`. Settings
persist between launches; the password is kept in your OS secret store (Keychain
on macOS, DPAPI on Windows, libsecret on Linux) via Electron `safeStorage`, not in
plain text. Turning the proxy off clears it and kills any tunnel this app started
(an externally-started one is left alone). The status pill is green when active,
red with a reason on failure.

### Auth

By default the tunnel authenticates the way `ssh` already does on your machine:
keys / `ssh-agent` and `~/.ssh/config`. Prism spawns `ssh` without a terminal, so
it can't answer an interactive password prompt; if your host needs a password,
enter it in the proxy settings and Prism feeds it via `sshpass`. Leave the
password blank to use keys.

### Requirements

The proxy shells out to standard SSH tooling:

| tool | needed for | install |
| --- | --- | --- |
| `ssh` | always | preinstalled on macOS/Linux; OpenSSH client ships with Windows 10+ |
| `autossh` | key-based tunnels (auto-reconnect) | macOS `brew install autossh`; Debian/Ubuntu `apt install autossh`; Fedora `dnf install autossh`; Arch `pacman -S autossh` |
| `sshpass` | password auth only | macOS `brew install hudochenkov/sshpass/sshpass`; Debian/Ubuntu `apt install sshpass`; Fedora `dnf install sshpass`; Arch `pacman -S sshpass` |

If `sshpass` is missing when you set a password, the status pill explains how to
install it.

**Windows:** neither `autossh` nor `sshpass` is packaged natively, so the Dev
Proxy is really a macOS/Linux feature. On Windows, run it under WSL, or start the
SSH tunnel yourself (the Windows OpenSSH `ssh -D <port> <host>`) and Prism will
reuse it on that port.

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

- Per-pane proxy (separate partitions) to compare local-direct vs proxied-remote
  in adjacent panes.
- Deeper device emulation via CDP `Emulation.setDeviceMetricsOverride`
  (device-pixel-ratio, touch).
- Header diffing in the body-diff view; "clear on navigate" for the network table.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the
type/build gates, and the hard-won gotchas to avoid regressing. PRs target `main`
and need one approving review before merge.

## License

[MIT](LICENSE) © Moravec Pty Ltd
