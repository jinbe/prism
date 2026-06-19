<script lang="ts">
  import type { ProxyStatus } from '../../../preload/index'
  import {
    Plus,
    ArrowLineRight,
    CursorClick,
    Path,
    Pulse,
    PlugsConnected,
    GearSix
  } from '../lib/icons'

  interface Props {
    globalUrl: string
    syncInteractions: boolean
    syncRoutes: boolean
    proxyHost: string
    proxyPort: number
    proxy: ProxyStatus
    showNet: boolean
    onOpenAll: () => void
    onAddPane: () => void
    onToggleProxy: () => void
    onToggleNet: () => void
  }

  let {
    globalUrl = $bindable(),
    syncInteractions = $bindable(),
    syncRoutes = $bindable(),
    proxyHost = $bindable(),
    proxyPort = $bindable(),
    proxy,
    showNet,
    onOpenAll,
    onAddPane,
    onToggleProxy,
    onToggleNet
  }: Props = $props()

  let showProxyCfg = $state(false)

  const pillClass = $derived(proxy.enabled ? 'pill on' : proxy.reason ? 'pill err' : 'pill')
  const pillText = $derived(
    proxy.enabled ? `${proxy.host}:${proxy.port}` : proxy.reason ? 'error' : 'offline'
  )
</script>

<div class="topbar">
  <span class="wordmark">PRIS<b>M</b></span>

  <button class="btn-icon" title="Add pane" aria-label="Add pane" onclick={onAddPane}>
    <Plus />
  </button>

  <input
    class="field addr url-command"
    placeholder="Open a URL in every pane — localhost:3000, example.com…"
    bind:value={globalUrl}
    onkeydown={(e) => e.key === 'Enter' && onOpenAll()}
  />
  <button class="btn btn-primary" onclick={onOpenAll}>
    <ArrowLineRight />
    Open in all
  </button>

  <div class="rule"></div>

  <button
    class={`seg ${syncInteractions ? 'on' : ''}`}
    aria-pressed={syncInteractions}
    title="Replay clicks, scroll, and typing across synced panes"
    onclick={() => (syncInteractions = !syncInteractions)}
  >
    <span class="ico"><CursorClick /></span>
    Interactions
  </button>
  <button
    class={`seg ${syncRoutes ? 'on' : ''}`}
    aria-pressed={syncRoutes}
    title="When one pane navigates, send the others to the same path"
    onclick={() => (syncRoutes = !syncRoutes)}
  >
    <span class="ico"><Path /></span>
    Routes
  </button>

  <div class="bar-spacer"></div>

  <button
    class={`seg ${showNet ? 'on' : ''}`}
    title="Cross-pane network diff"
    aria-pressed={showNet}
    onclick={onToggleNet}
  >
    <span class="ico"><Pulse /></span>
    Network
  </button>

  <div class="rule"></div>

  <button
    class={`seg ${proxy.enabled ? 'on' : ''}`}
    aria-pressed={proxy.enabled}
    title="Tunnel localhost to the remote machine over SSH (SOCKS5)"
    onclick={onToggleProxy}
  >
    <span class="ico"><PlugsConnected /></span>
    Dev Proxy
  </button>
  <button
    class="btn-icon"
    title="Proxy settings"
    aria-label="Proxy settings"
    onclick={() => (showProxyCfg = !showProxyCfg)}
  >
    <GearSix />
  </button>
  <span class={pillClass} title={proxy.reason ?? ''}>
    <span class="dot"></span>
    {pillText}
  </span>

  {#if showProxyCfg}
    <div class="rule"></div>
    <label class="cfg">
      host
      <input class="field" style="width:128px;height:26px" bind:value={proxyHost} />
    </label>
    <label class="cfg">
      port
      <input
        class="field addr"
        style="width:64px;height:26px"
        type="number"
        bind:value={proxyPort}
      />
    </label>
  {/if}
</div>
