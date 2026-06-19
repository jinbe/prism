<script lang="ts">
  import type { ProxyStatus } from '../../../preload/index'
  import {
    Plus,
    ArrowLineRight,
    CursorClick,
    Path,
    Pulse,
    PlugsConnected,
    GearSix,
    SpinnerGap,
    SidebarSimple,
    Intersect
  } from '../lib/icons'

  interface Props {
    globalUrl: string
    syncInteractions: boolean
    syncRoutes: boolean
    proxyHost: string
    proxyPort: number
    proxyUser: string
    proxyPassword: string
    proxy: ProxyStatus
    connecting: boolean
    secureStore: boolean
    showNet: boolean
    sidebarOpen: boolean
    canDiff: boolean
    onToggleSidebar: () => void
    onOpenDiff: () => void
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
    proxyUser = $bindable(),
    proxyPassword = $bindable(),
    proxy,
    connecting,
    secureStore,
    showNet,
    sidebarOpen,
    canDiff,
    onToggleSidebar,
    onOpenDiff,
    onOpenAll,
    onAddPane,
    onToggleProxy,
    onToggleNet
  }: Props = $props()

  let showProxyCfg = $state(false)
  let proxyWrapEl: HTMLDivElement | undefined = $state()

  // Dismiss the settings popover on outside-click / Escape.
  $effect(() => {
    if (!showProxyCfg) return
    const onDown = (e: PointerEvent): void => {
      if (proxyWrapEl && !proxyWrapEl.contains(e.target as Node)) showProxyCfg = false
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') showProxyCfg = false
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  })

  const pillClass = $derived(
    connecting ? 'pill connecting' : proxy.enabled ? 'pill on' : proxy.reason ? 'pill err' : 'pill'
  )
  const pillText = $derived(
    connecting
      ? 'connecting…'
      : proxy.enabled
        ? `${proxy.host}:${proxy.port}`
        : proxy.reason
          ? 'error'
          : 'offline'
  )
</script>

<div class="topbar">
  <button
    class={`btn-icon ${sidebarOpen ? 'on' : ''}`}
    title="Toggle projects"
    aria-label="Toggle projects"
    aria-pressed={sidebarOpen}
    onclick={onToggleSidebar}
  >
    <SidebarSimple />
  </button>

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

  {#if canDiff}
    <button
      class="seg"
      title="Merge both panes into a highlighted visual diff"
      onclick={onOpenDiff}
    >
      <span class="ico"><Intersect /></span>
      Visual diff
    </button>
  {/if}

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

  <div class="proxy-control" bind:this={proxyWrapEl}>
    <button
      class={`seg ${connecting ? 'busy' : proxy.enabled ? 'on' : ''}`}
      aria-pressed={proxy.enabled}
      aria-busy={connecting}
      disabled={connecting}
      title="Tunnel localhost to the remote machine over SSH (SOCKS5)"
      onclick={onToggleProxy}
    >
      <span class={`ico ${connecting ? 'spin' : ''}`}>
        {#if connecting}<SpinnerGap />{:else}<PlugsConnected />{/if}
      </span>
      Dev Proxy
    </button>
    <button
      class={`cog ${showProxyCfg ? 'on' : ''}`}
      title="Proxy settings"
      aria-label="Proxy settings"
      aria-expanded={showProxyCfg}
      onclick={() => (showProxyCfg = !showProxyCfg)}
    >
      <GearSix />
    </button>

    {#if showProxyCfg}
      <div class="popover" role="dialog" aria-label="Proxy settings">
        <div class="pop-head">Dev Proxy</div>
        <label class="pop-row">
          <span>Host</span>
          <input class="field addr" placeholder="ssh host or alias" bind:value={proxyHost} />
        </label>
        <label class="pop-row">
          <span>SOCKS port</span>
          <input class="field addr" type="number" bind:value={proxyPort} />
        </label>
        <label class="pop-row">
          <span>Username</span>
          <input class="field" placeholder="optional" autocomplete="off" bind:value={proxyUser} />
        </label>
        <label class="pop-row">
          <span>Password</span>
          <input
            class="field"
            type="password"
            placeholder="optional"
            autocomplete="off"
            bind:value={proxyPassword}
          />
        </label>
        <p class="pop-hint">
          Uses your SSH keys by default. Set a password to authenticate with sshpass instead. This
          is your login for the remote host, not the SOCKS port.
        </p>
        <p class="pop-hint">
          {secureStore
            ? 'Saved automatically. The password is encrypted in your system keychain.'
            : 'Settings are saved, but no system keychain is available, so the password will not persist.'}
        </p>
      </div>
    {/if}
  </div>
  <span class={pillClass} title={proxy.reason ?? ''}>
    <span class="dot"></span>
    {pillText}
  </span>
</div>
