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

  let panes = $state<PaneModel[]>([makePane('iphone-15'), makePane('desktop')])
  let globalUrl = $state('https://www.google.com')
  let syncInteractions = $state(true)
  let syncRoutes = $state(true)

  let proxy = $state<ProxyStatus>({ enabled: false })
  let proxyHost = $state('dev-host')
  let proxyPort = $state(1080)

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
    proxy = proxy.enabled
      ? await window.api.devProxy.disable()
      : await window.api.devProxy.enable({ host: proxyHost, port: proxyPort })
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
      {proxy}
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
