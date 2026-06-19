<script lang="ts">
  import type { ProxyStatus } from '../../../preload/index'

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

  const pillClass = $derived(
    proxy.enabled ? 'proxy-pill on' : proxy.reason ? 'proxy-pill err' : 'proxy-pill'
  )
  const pillText = $derived(
    proxy.enabled
      ? `proxy: ${proxy.host}:${proxy.port}`
      : proxy.reason
        ? 'proxy: error'
        : 'proxy: off'
  )
</script>

<div class="toolbar">
  <button class="btn icon" title="Add pane" onclick={onAddPane}>＋</button>

  <input
    class="url-input"
    placeholder="Open URL in all panes (e.g. localhost:3000)…"
    bind:value={globalUrl}
    onkeydown={(e) => e.key === 'Enter' && onOpenAll()}
  />
  <button class="btn" onclick={onOpenAll}>Open in all</button>

  <div class="sep"></div>

  <label class="toggle" title="Replay clicks / scroll / typing across panes">
    <input type="checkbox" bind:checked={syncInteractions} />
    Mirror interactions
  </label>
  <label class="toggle" title="When one pane navigates, send the others to the same path">
    <input type="checkbox" bind:checked={syncRoutes} />
    Mirror routes
  </label>

  <div class="sep"></div>

  <button
    class={`btn ${showNet ? 'active' : ''}`}
    onclick={onToggleNet}
    title="Cross-pane network diff"
  >
    Network
  </button>

  <div class="sep"></div>

  <button
    class={`btn ${proxy.enabled ? 'active' : ''}`}
    onclick={onToggleProxy}
    title="Tunnel localhost to the remote machine over SSH (SOCKS5)"
  >
    {proxy.enabled ? 'Dev Proxy: ON' : 'Dev Proxy: OFF'}
  </button>
  <button class="btn icon" title="Proxy settings" onclick={() => (showProxyCfg = !showProxyCfg)}
    >⚙</button
  >
  <span class={pillClass} title={proxy.reason ?? ''}>
    <span class="dot"></span>
    {pillText}
  </span>

  {#if showProxyCfg}
    <div class="sep"></div>
    <label class="toggle">
      host
      <input style="width:130px" bind:value={proxyHost} />
    </label>
    <label class="toggle">
      port
      <input style="width:64px" type="number" bind:value={proxyPort} />
    </label>
  {/if}
</div>
