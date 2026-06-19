<script lang="ts">
  import Toolbar from './components/Toolbar.svelte'
  import Pane from './components/Pane.svelte'
  import NetworkPanel from './components/NetworkPanel.svelte'
  import {
    presetByKey,
    normalizeUrl,
    type Pane as PaneModel,
    type PaneEventMsg,
    type PaneHandle
  } from './types'
  import { applyNetEvent, type NetStore } from './netStore'
  import type { ProxyStatus } from '../../preload/index'
  import { IconContext } from 'phosphor-svelte'

  const PANE_PARTITION = 'persist:panes'

  let paneSeq = 0
  function makePane(device: string, url = 'https://www.google.com'): PaneModel {
    const preset = presetByKey(device)
    return {
      id: `pane-${++paneSeq}`,
      url,
      currentUrl: url,
      width: preset.width,
      height: preset.height,
      device,
      mirror: true
    }
  }

  function defaultPanes(): PaneModel[] {
    return [makePane('iphone-15'), makePane('desktop')]
  }

  type SavedPane = Pick<PaneModel, 'device' | 'width' | 'height' | 'url' | 'currentUrl' | 'mirror'>
  interface UiState {
    panes?: SavedPane[]
    globalUrl?: string
    syncInteractions?: boolean
    syncRoutes?: boolean
    showNet?: boolean
  }

  // Panes start empty and are populated once persisted state loads, so we don't
  // build (and immediately tear down) the default webviews on a restore.
  let panes = $state<PaneModel[]>([])
  let stateLoaded = $state(false)
  let secureStore = $state(true)
  let globalUrl = $state('https://www.google.com')
  let syncInteractions = $state(true)
  let syncRoutes = $state(true)

  let proxy = $state<ProxyStatus>({ enabled: false })
  let proxyConnecting = $state(false)
  let proxyHost = $state('dev-host')
  let proxyPort = $state(1080)
  let proxyUser = $state('')
  let proxyPassword = $state('')

  let showNet = $state(false)
  let netTick = $state(0)

  // Non-reactive maps (mutated directly; we bump netTick to trigger re-renders).
  const handles = new Map<string, PaneHandle>()
  const netData: NetStore = new Map()
  let routingLock = false

  const preloadUrl = window.api.webviewPreloadUrl

  const paneCols = $derived(
    panes.map((p, i) => ({ id: p.id, label: `${presetByKey(p.device).label} ·${i + 1}` }))
  )

  // Restore persisted UI layout + proxy settings once on startup.
  $effect(() => {
    void (async () => {
      const [ui, ps] = await Promise.all([
        window.api.uiState.load() as Promise<UiState | null>,
        window.api.settings.loadProxy()
      ])
      panes =
        ui?.panes && ui.panes.length > 0
          ? ui.panes.map((p) => ({
              id: `pane-${++paneSeq}`,
              url: p.currentUrl ?? p.url,
              currentUrl: p.currentUrl ?? p.url,
              width: p.width,
              height: p.height,
              device: p.device,
              mirror: p.mirror
            }))
          : defaultPanes()
      if (ui?.globalUrl != null) globalUrl = ui.globalUrl
      if (ui?.syncInteractions != null) syncInteractions = ui.syncInteractions
      if (ui?.syncRoutes != null) syncRoutes = ui.syncRoutes
      if (ui?.showNet != null) showNet = ui.showNet

      if (ps.host != null) proxyHost = ps.host
      if (ps.port != null) proxyPort = ps.port
      if (ps.username != null) proxyUser = ps.username
      if (ps.password != null) proxyPassword = ps.password
      secureStore = ps.secure

      stateLoaded = true
    })()
  })

  // Persist UI layout (debounced) once the initial restore has happened.
  let uiSaveTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const snapshot: UiState = {
      panes: panes.map((p) => ({
        device: p.device,
        width: p.width,
        height: p.height,
        url: p.url,
        currentUrl: p.currentUrl,
        mirror: p.mirror
      })),
      globalUrl,
      syncInteractions,
      syncRoutes,
      showNet
    }
    if (!stateLoaded) return
    clearTimeout(uiSaveTimer)
    uiSaveTimer = setTimeout(() => void window.api.uiState.save(snapshot), 400)
  })

  // Persist proxy settings (debounced); password goes to the OS keychain.
  let proxySaveTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const snapshot = {
      host: proxyHost,
      port: proxyPort,
      username: proxyUser.trim(),
      password: proxyPassword
    }
    if (!stateLoaded) return
    clearTimeout(proxySaveTimer)
    proxySaveTimer = setTimeout(() => void window.api.settings.saveProxy(snapshot), 500)
  })

  // Proxy status subscription (runs once).
  $effect(() => {
    void window.api.devProxy.status().then((s) => (proxy = s))
    return window.api.onProxyStatus((s) => (proxy = s))
  })

  // Network event subscription (runs once).
  $effect(() => {
    return window.api.onNetEvent((ev) => applyNetEvent(netData, ev))
  })

  // While the panel is open, repaint a few times a second.
  $effect(() => {
    if (!showNet) return
    const t = setInterval(() => netTick++, 300)
    return () => clearInterval(t)
  })

  function onReady(id: string, handle: PaneHandle): void {
    handles.set(id, handle)
  }

  function onEvent(sourceId: string, msg: PaneEventMsg): void {
    if (!syncInteractions) return
    const src = panes.find((p) => p.id === sourceId)
    if (!src || !src.mirror) return
    for (const p of panes) {
      if (p.id === sourceId || !p.mirror) continue
      handles.get(p.id)?.replay(msg)
    }
  }

  function onNavigate(sourceId: string, url: string): void {
    panes = panes.map((p) => (p.id === sourceId ? { ...p, currentUrl: url } : p))
    if (!syncRoutes || routingLock) return
    const src = panes.find((p) => p.id === sourceId)
    if (!src || !src.mirror) return
    routingLock = true
    for (const p of panes) {
      if (p.id === sourceId || !p.mirror) continue
      handles.get(p.id)?.loadURL(url)
    }
    setTimeout(() => (routingLock = false), 400)
  }

  function onChange(id: string, patch: Partial<PaneModel>): void {
    panes = panes.map((p) => (p.id === id ? { ...p, ...patch } : p))
  }

  function onClose(id: string): void {
    handles.delete(id)
    void window.api.netInspect.detach(id)
    netData.delete(id)
    panes = panes.filter((p) => p.id !== id)
  }

  function addPane(): void {
    panes = [...panes, makePane('laptop', globalUrl || 'about:blank')]
  }

  function openAll(): void {
    const url = normalizeUrl(globalUrl)
    routingLock = true
    for (const p of panes) handles.get(p.id)?.loadURL(url)
    setTimeout(() => (routingLock = false), 400)
  }

  async function toggleProxy(): Promise<void> {
    if (proxyConnecting) return
    if (proxy.enabled) {
      proxy = await window.api.devProxy.disable()
      return
    }
    proxyConnecting = true
    try {
      proxy = await window.api.devProxy.enable({
        host: proxyHost,
        port: proxyPort,
        username: proxyUser.trim() || undefined,
        password: proxyPassword || undefined
      })
    } finally {
      proxyConnecting = false
    }
  }

  function clearNet(): void {
    netData.clear()
    netTick++
  }

  function onAttach(id: string, webContentsId: number): void {
    void window.api.netInspect.attach(id, webContentsId)
  }
</script>

<IconContext values={{ weight: 'light' }}>
  <div class="app">
    <Toolbar
      bind:globalUrl
      bind:syncInteractions
      bind:syncRoutes
      bind:proxyHost
      bind:proxyPort
      bind:proxyUser
      bind:proxyPassword
      {proxy}
      connecting={proxyConnecting}
      {secureStore}
      {showNet}
      onOpenAll={openAll}
      onAddPane={addPane}
      onToggleProxy={() => void toggleProxy()}
      onToggleNet={() => (showNet = !showNet)}
    />

    <div class="panes">
      {#each panes as pane, i (pane.id)}
        <Pane
          {pane}
          index={i}
          partition={PANE_PARTITION}
          {preloadUrl}
          canClose={panes.length > 1}
          {onEvent}
          {onNavigate}
          {onReady}
          {onChange}
          {onClose}
          {onAttach}
        />
      {/each}
    </div>

    {#if showNet}
      <NetworkPanel
        data={netData}
        cols={paneCols}
        tick={netTick}
        onClear={clearNet}
        onClose={() => (showNet = false)}
      />
    {/if}
  </div>
</IconContext>
