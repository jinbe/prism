# CLAUDE.md

Guidance for working in this repo. Prism is a developer-focused browser built on
Electron (real Chromium per pane) with a Svelte 5 renderer. It's built for
side-by-side A/B and responsive testing.

## Commands

```bash
pnpm run dev        # electron-vite dev (hot reload) — the real smoke test; GUI can't be verified headless
pnpm run build      # compile main + both preloads + renderer into out/
pnpm run typecheck  # svelte-check (covers .svelte and .ts)
pnpm run build:mac  # package via electron-builder (also :win, :linux)
```

Always run `pnpm run build` and `pnpm run typecheck` after changes — both must be clean.
`svelte-check` is the type gate (the Vite/esbuild build does NOT typecheck `.ts`).

## Process model

- **main** (`src/main/`) — Node/Electron. Owns the window, the SSH dev proxy, and
  CDP network capture. Only the main process can use `webContents.debugger`.
- **preload/index.ts** — main-window bridge. Exposes `window.api` via `contextBridge`
  (proxy controls, net-inspect controls, and `webviewPreloadUrl`).
- **preload/webview.ts** — injected into every `<webview>` pane. The interaction
  **mirroring engine**: captures scroll/click/key/input and replays forwarded events.
  Talks to the host with `ipcRenderer.sendToHost` / `ipcRenderer.on('replay-event')`.
- **renderer** (`src/renderer/`) — Svelte 5 UI. `App.svelte` orchestrates panes and
  forwards mirrored events/routes between them via per-pane handles.

## Hard-won gotchas (don't regress these)

- **Preloads must stay CommonJS.** Do NOT add `"type": "module"` to package.json — it
  makes electron-vite emit `.mjs` preloads, which breaks `__dirname` (used to resolve
  the webview preload URL) and Electron's preload loading. The Svelte config is
  `svelte.config.mjs` purely to silence a Node parse warning; keep the package CJS.
- **Don't name a Svelte rune variable `state`.** `let state = $state(...)` confuses the
  compiler (`$state` collision). Use a different name (e.g. `phase`).
- **`<webview>` is created imperatively** in `Pane.svelte`'s `onMount`, not in the
  template — attributes like `preload`/`partition`/`useragent` must be set before the
  element is attached. The main window sets `webviewTag: true`, `sandbox: false`.
- **Network capture attaches per pane by `webContentsId`**, obtained on the webview's
  `dom-ready` event and sent to main via `netinspect:attach`. Response-body lookups are
  keyed by **paneId** (CDP requestIds can collide across panes) — never by requestId alone.
- **Opening a pane's native DevTools detaches our CDP client** (Chromium allows one
  debugger per page), so that pane's network capture pauses while DevTools is open.
- **Mirroring loop guard:** the webview preload suppresses capture briefly while
  replaying an incoming event so it doesn't echo back. Keep that guard if you touch it.

## Conventions

- Device presets and the URL-normalize helper live in `src/renderer/src/types.ts`.
- Network event assembly + diff logic is framework-agnostic in `src/renderer/src/netStore.ts`.
- All panes share the `persist:panes` session partition (same cookies/storage) so A/B
  testing behaves as one logged-in user; the dev proxy is applied to that partition.

## Dev Proxy

`src/main/devProxy.ts` reproduces the user's `chrome-dev` script: ensures an
`autossh -D <port> <host>` SOCKS5 tunnel is up (reusing an existing one if the port is
open), then sets the pane session proxy to `socks5://127.0.0.1:<port>` with
`proxyBypassRules: '<-loopback>'` so `localhost` resolves on the remote host. Default
host `dev-host`, port `1080`.
