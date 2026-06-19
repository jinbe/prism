# Contributing to Prism

Thanks for your interest in Prism. This is an Electron + Svelte 5 developer
browser for side-by-side A/B and responsive testing. Contributions of all kinds
are welcome: bug reports, features, docs, and tests.

## Getting started

Requires **Node 18+** and **pnpm**.

```bash
pnpm install
pnpm run dev        # launches the app with hot reload
```

The dev window is the real smoke test: the GUI can't be verified headless, so run
the app and exercise your change before opening a PR.

## Before you open a PR

Both of these must be clean:

```bash
pnpm run typecheck  # svelte-check (the type gate — esbuild does NOT typecheck .ts)
pnpm run build      # compile main + both preloads + renderer into out/
```

Formatting runs automatically on commit (husky + lint-staged with Prettier). You
can run it manually with `pnpm run format`.

## Project layout

See [README.md](README.md#architecture) for the full architecture. In short:

- `src/main/` — Node/Electron: window, SSH dev proxy, CDP network capture.
- `src/preload/` — context-bridge for the main window (`index.ts`) and the
  per-pane interaction mirroring engine (`webview.ts`). Both must stay CommonJS.
- `src/renderer/` — the Svelte 5 UI.

## Hard-won gotchas (don't regress these)

These have bitten us before. Keep them in mind when touching the relevant areas:

- **Preloads must stay CommonJS.** Do NOT add `"type": "module"` to `package.json`
  — it makes electron-vite emit `.mjs` preloads, which breaks `__dirname` (used to
  resolve the webview preload URL) and Electron's preload loading.
- **Don't name a Svelte rune variable `state`.** `let state = $state(...)` collides
  with the `$state` rune. Use another name (e.g. `phase`).
- **`<webview>` is created imperatively** in `Pane.svelte`'s `onMount` — attributes
  like `preload`/`partition`/`useragent` must be set before it's attached. The
  webview host needs `display: flex` so its internal `<iframe>` fills (otherwise it
  collapses to Electron's default 150px height).
- **Network capture is keyed by paneId**, not requestId — CDP requestIds collide
  across panes. Capture attaches per pane via `webContentsId` on `dom-ready`.
- **Opening a pane's native DevTools detaches our CDP client** (one debugger per
  page), so that pane's network capture pauses while DevTools is open.
- **Mirroring loop guard:** the webview preload suppresses capture briefly while
  replaying an incoming event so it doesn't echo back. Keep that guard if you touch
  the mirroring path.

## Pull requests

- Branch off `main`; PRs target `main` and need one approving review before merge.
  (This is the project policy; it will be enforced via branch protection once the
  repo is public.)
- Keep PRs focused; one logical change per PR where practical.
- Write commit messages and PR descriptions that explain the _why_, not just the
  _what_.
- Describe how you verified the change (which flows you exercised in the running
  app), since CI can't drive the GUI.
- By contributing, you agree your contributions are licensed under the
  [MIT License](LICENSE).

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and your OS +
Node/pnpm versions. A screenshot or screen recording helps a lot for UI issues.
