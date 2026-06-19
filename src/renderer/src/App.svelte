<script lang="ts">
  import Toolbar from './components/Toolbar.svelte'
  import Pane from './components/Pane.svelte'
  import NetworkPanel from './components/NetworkPanel.svelte'
  import WorkspaceRail from './components/WorkspaceRail.svelte'
  import VisualDiff from './components/VisualDiff.svelte'
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

  // A workspace is one project: its own set of panes. All workspaces stay mounted
  // (hidden ones are display:none) so switching tabs keeps each project's pages
  // live instead of reloading them.
  interface Workspace {
    id: string
    name: string
    panes: PaneModel[]
  }

  let paneSeq = 0
  let wsSeq = 0

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
  function makeWorkspace(name: string, panes: PaneModel[]): Workspace {
    return { id: `ws-${++wsSeq}`, name, panes }
  }

  type SavedPane = Pick<PaneModel, 'device' | 'width' | 'height' | 'url' | 'currentUrl' | 'mirror'>
  interface SavedWorkspace {
    name: string
    panes: SavedPane[]
  }
  interface UiState {
    workspaces?: SavedWorkspace[]
    activeIndex?: number
    sidebarOpen?: boolean
    // Legacy single-list format (pre-workspaces); migrated into one workspace.
    panes?: SavedPane[]
    globalUrl?: string
    syncInteractions?: boolean
    syncRoutes?: boolean
    showNet?: boolean
  }
  function restorePane(p: SavedPane): PaneModel {
    return {
      id: `pane-${++paneSeq}`,
      url: p.currentUrl ?? p.url,
      currentUrl: p.currentUrl ?? p.url,
      width: p.width,
      height: p.height,
      device: p.device,
      mirror: p.mirror
    }
  }

  let workspaces = $state<Workspace[]>([])
  let activeId = $state('')
  let sidebarOpen = $state(true)
  let diffOpen = $state(false)

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
  // webContentsId per pane (captured on dom-ready) and which panes currently have
  // CDP network capture attached. Only the active workspace's panes are attached.
  const wcIds = new Map<string, number>()
  const attachedPanes = new Set<string>()
  let routingLock = false

  const preloadUrl = window.api.webviewPreloadUrl

  const active = $derived(workspaces.find((w) => w.id === activeId))
  const activePanes = $derived(active?.panes ?? [])
  const paneCols = $derived(
    activePanes.map((p, i) => ({ id: p.id, label: `${presetByKey(p.device).label} ·${i + 1}` }))
  )
  // The visual diff only makes sense when two panes share a viewport width.
  const canDiff = $derived(
    activePanes.length === 2 && activePanes[0].width === activePanes[1].width
  )

  function wsOf(paneId: string): Workspace | undefined {
    return workspaces.find((w) => w.panes.some((p) => p.id === paneId))
  }
  function patchPane(paneId: string, patch: Partial<PaneModel>): void {
    workspaces = workspaces.map((w) => ({
      ...w,
      panes: w.panes.map((p) => (p.id === paneId ? { ...p, ...patch } : p))
    }))
  }

  // Restore persisted UI layout + proxy settings once on startup.
  $effect(() => {
    void (async () => {
      const [ui, ps] = await Promise.all([
        window.api.uiState.load() as Promise<UiState | null>,
        window.api.settings.loadProxy()
      ])
      let restored: Workspace[]
      if (ui?.workspaces && ui.workspaces.length > 0) {
        restored = ui.workspaces.map((w) => makeWorkspace(w.name, w.panes.map(restorePane)))
      } else if (ui?.panes && ui.panes.length > 0) {
        restored = [makeWorkspace('Project 1', ui.panes.map(restorePane))]
      } else {
        restored = [makeWorkspace('Project 1', defaultPanes())]
      }
      workspaces = restored
      activeId = restored[Math.min(ui?.activeIndex ?? 0, restored.length - 1)].id
      if (ui?.sidebarOpen != null) sidebarOpen = ui.sidebarOpen
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
      workspaces: workspaces.map((w) => ({
        name: w.name,
        panes: w.panes.map((p) => ({
          device: p.device,
          width: p.width,
          height: p.height,
          url: p.url,
          currentUrl: p.currentUrl,
          mirror: p.mirror
        }))
      })),
      activeIndex: Math.max(
        0,
        workspaces.findIndex((w) => w.id === activeId)
      ),
      sidebarOpen,
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

  // Keep CDP attachment in sync with whichever workspace is active.
  $effect(() => {
    void activePanes
    reconcileCapture()
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
    const ws = wsOf(sourceId)
    const src = ws?.panes.find((p) => p.id === sourceId)
    if (!ws || !src || !src.mirror) return
    for (const p of ws.panes) {
      if (p.id === sourceId || !p.mirror) continue
      handles.get(p.id)?.replay(msg)
    }
  }

  function onNavigate(sourceId: string, url: string): void {
    patchPane(sourceId, { currentUrl: url })
    if (!syncRoutes || routingLock) return
    const ws = wsOf(sourceId)
    const src = ws?.panes.find((p) => p.id === sourceId)
    if (!ws || !src || !src.mirror) return
    routingLock = true
    for (const p of ws.panes) {
      if (p.id === sourceId || !p.mirror) continue
      handles.get(p.id)?.loadURL(url)
    }
    setTimeout(() => (routingLock = false), 400)
  }

  function onChange(id: string, patch: Partial<PaneModel>): void {
    patchPane(id, patch)
  }

  function onClose(id: string): void {
    handles.delete(id)
    void window.api.netInspect.detach(id)
    netData.delete(id)
    wcIds.delete(id)
    attachedPanes.delete(id)
    workspaces = workspaces.map((w) => ({ ...w, panes: w.panes.filter((p) => p.id !== id) }))
  }

  function addPane(): void {
    if (!active) return
    const np = makePane('laptop', globalUrl || 'about:blank')
    workspaces = workspaces.map((w) => (w.id === activeId ? { ...w, panes: [...w.panes, np] } : w))
  }

  function openAll(): void {
    const url = normalizeUrl(globalUrl)
    routingLock = true
    for (const p of activePanes) handles.get(p.id)?.loadURL(url)
    setTimeout(() => (routingLock = false), 400)
  }

  // ----- workspaces ----------------------------------------------------------
  function selectWorkspace(id: string): void {
    activeId = id
    diffOpen = false
  }
  function addWorkspace(): void {
    const ws = makeWorkspace(`Project ${workspaces.length + 1}`, defaultPanes())
    workspaces = [...workspaces, ws]
    activeId = ws.id
    diffOpen = false
  }
  function closeWorkspace(id: string): void {
    const ws = workspaces.find((w) => w.id === id)
    if (!ws || workspaces.length <= 1) return
    for (const p of ws.panes) {
      handles.delete(p.id)
      void window.api.netInspect.detach(p.id)
      netData.delete(p.id)
      wcIds.delete(p.id)
      attachedPanes.delete(p.id)
    }
    const idx = workspaces.findIndex((w) => w.id === id)
    workspaces = workspaces.filter((w) => w.id !== id)
    if (activeId === id) activeId = workspaces[Math.max(0, idx - 1)]?.id ?? workspaces[0].id
  }
  function renameWorkspace(id: string, name: string): void {
    workspaces = workspaces.map((w) => (w.id === id ? { ...w, name } : w))
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
    wcIds.set(id, webContentsId)
    reconcileCapture()
  }

  // Attach CDP network capture for the active workspace's panes only; detach the
  // rest so background workspaces don't accumulate network data unbounded.
  function reconcileCapture(): void {
    const activeIds = new Set(activePanes.map((p) => p.id))
    for (const p of activePanes) {
      const wc = wcIds.get(p.id)
      if (wc != null && !attachedPanes.has(p.id)) {
        void window.api.netInspect.attach(p.id, wc)
        attachedPanes.add(p.id)
      }
    }
    for (const id of [...attachedPanes]) {
      if (!activeIds.has(id)) {
        void window.api.netInspect.detach(id)
        attachedPanes.delete(id)
        netData.delete(id)
      }
    }
  }

  function capturePane(id: string): Promise<string | null> {
    return handles.get(id)?.capture() ?? Promise.resolve(null)
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
      {sidebarOpen}
      {canDiff}
      onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
      onOpenDiff={() => (diffOpen = true)}
      onOpenAll={openAll}
      onAddPane={addPane}
      onToggleProxy={() => void toggleProxy()}
      onToggleNet={() => (showNet = !showNet)}
    />

    <div class="body">
      {#if sidebarOpen}
        <WorkspaceRail
          workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, count: w.panes.length }))}
          {activeId}
          onSelect={selectWorkspace}
          onAdd={addWorkspace}
          onCloseWorkspace={closeWorkspace}
          onRename={renameWorkspace}
          onCollapse={() => (sidebarOpen = false)}
        />
      {/if}

      <div class="stack">
        {#each workspaces as ws (ws.id)}
          <div class="panes" class:hidden={ws.id !== activeId}>
            {#each ws.panes as pane, i (pane.id)}
              <Pane
                {pane}
                index={i}
                partition={PANE_PARTITION}
                {preloadUrl}
                canClose={ws.panes.length > 1}
                {onEvent}
                {onNavigate}
                {onReady}
                {onChange}
                {onClose}
                {onAttach}
              />
            {/each}
          </div>
        {/each}

        {#if showNet}
          <NetworkPanel
            data={netData}
            cols={paneCols}
            tick={netTick}
            onClear={clearNet}
            onClose={() => (showNet = false)}
          />
        {/if}

        {#if diffOpen && canDiff}
          <VisualDiff
            a={{ id: activePanes[0].id, label: paneCols[0].label }}
            b={{ id: activePanes[1].id, label: paneCols[1].label }}
            capture={capturePane}
            onClose={() => (diffOpen = false)}
          />
        {/if}
      </div>
    </div>
  </div>
</IconContext>
