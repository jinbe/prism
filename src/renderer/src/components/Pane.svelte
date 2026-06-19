<script lang="ts">
  import { onMount } from 'svelte'
  import {
    DEVICE_PRESETS,
    presetByKey,
    normalizeUrl,
    DESKTOP_UA,
    type Pane as PaneModel,
    type PaneEventMsg,
    type PaneHandle
  } from '../types'
  import { CaretLeft, CaretRight, ArrowClockwise, Code, X, Link, LinkBreak } from '../lib/icons'

  interface Props {
    pane: PaneModel
    index: number
    partition: string
    preloadUrl: string
    canClose: boolean
    onEvent: (paneId: string, msg: PaneEventMsg) => void
    onNavigate: (paneId: string, url: string) => void
    onReady: (paneId: string, handle: PaneHandle) => void
    onChange: (paneId: string, patch: Partial<PaneModel>) => void
    onClose: (paneId: string) => void
    onAttach: (paneId: string, webContentsId: number) => void
  }

  let {
    pane,
    index,
    partition,
    preloadUrl,
    canClose,
    onEvent,
    onNavigate,
    onReady,
    onChange,
    onClose,
    onAttach
  }: Props = $props()

  let viewport: HTMLDivElement
  let stage: HTMLDivElement
  let wv: WebviewTag | null = null

  // Available content box of the stage (minus its padding), tracked live.
  const STAGE_PAD = 12
  let avail = $state({ w: 0, h: 0 })

  $effect(() => {
    if (!stage) return
    const ro = new ResizeObserver(() => {
      avail = { w: stage.clientWidth, h: stage.clientHeight }
    })
    ro.observe(stage)
    return () => ro.disconnect()
  })

  // Scale the frame down (never up) so a wide device fits the pane width.
  const scale = $derived.by(() => {
    const cw = avail.w - STAGE_PAD * 2
    return cw > 0 ? Math.min(1, cw / pane.width) : 1
  })
  // Frame fills the available height; the unscaled viewport is divided by the
  // scale so that, once scaled, it lands exactly on the available height.
  const frameH = $derived(avail.h > 0 ? Math.max(0, avail.h - STAGE_PAD * 2) : pane.height)
  const viewportH = $derived(frameH / scale)
  const frameW = $derived(pane.width * scale)

  onMount(() => {
    const preset = presetByKey(pane.device)
    const el = document.createElement('webview') as unknown as WebviewTag
    el.setAttribute('src', pane.url)
    el.setAttribute('preload', preloadUrl)
    el.setAttribute('partition', partition)
    el.setAttribute('allowpopups', 'true')
    if (preset.userAgent) el.setAttribute('useragent', preset.userAgent)

    const onIpc = (e: Event): void => {
      const ev = e as Event & { channel: string; args: unknown[] }
      if (ev.channel === 'pane-event') onEvent(pane.id, ev.args[0] as PaneEventMsg)
    }
    const onNav = (e: Event): void => {
      const ev = e as Event & { url: string }
      onNavigate(pane.id, ev.url)
    }
    const onDom = (): void => {
      try {
        onAttach(pane.id, el.getWebContentsId())
      } catch {
        /* not ready */
      }
    }

    el.addEventListener('ipc-message', onIpc)
    el.addEventListener('did-navigate', onNav)
    el.addEventListener('did-navigate-in-page', onNav)
    el.addEventListener('dom-ready', onDom)
    viewport.appendChild(el)
    wv = el

    onReady(pane.id, {
      replay: (m) => {
        try {
          el.send('replay-event', m)
        } catch {
          /* not ready */
        }
      },
      loadURL: (u) => {
        try {
          el.loadURL(u)
        } catch {
          /* ignore */
        }
      },
      reload: () => el.reload(),
      goBack: () => el.goBack(),
      goForward: () => el.goForward(),
      devtools: () => {
        try {
          el.openDevTools()
        } catch {
          /* ignore */
        }
      },
      capture: async () => {
        try {
          const img = await el.capturePage()
          return img.toDataURL()
        } catch {
          return null
        }
      }
    })

    return () => {
      el.removeEventListener('ipc-message', onIpc)
      el.removeEventListener('did-navigate', onNav)
      el.removeEventListener('did-navigate-in-page', onNav)
      el.removeEventListener('dom-ready', onDom)
      el.remove()
      wv = null
    }
  })

  // Apply user-agent when the device preset changes.
  $effect(() => {
    const dev = pane.device
    if (!wv) return
    try {
      wv.setUserAgent(presetByKey(dev).userAgent ?? DESKTOP_UA)
    } catch {
      /* ignore */
    }
  })

  function onPreset(key: string): void {
    const p = presetByKey(key)
    if (key === 'custom') onChange(pane.id, { device: key })
    else onChange(pane.id, { device: key, width: p.width, height: p.height })
  }
</script>

<div class="pane">
  <div class="pane-head">
    <span class="pane-tag">{String(index + 1).padStart(2, '0')}</span>

    <div class="pane-nav">
      <button class="btn-icon" title="Back" aria-label="Back" onclick={() => wv?.goBack()}>
        <CaretLeft />
      </button>
      <button class="btn-icon" title="Forward" aria-label="Forward" onclick={() => wv?.goForward()}>
        <CaretRight />
      </button>
      <button class="btn-icon" title="Reload" aria-label="Reload" onclick={() => wv?.reload()}>
        <ArrowClockwise />
      </button>
    </div>

    <select
      class="preset"
      value={pane.device}
      onchange={(e) => onPreset((e.target as HTMLSelectElement).value)}
    >
      {#each DEVICE_PRESETS as p (p.key)}
        <option value={p.key}>{p.label}</option>
      {/each}
    </select>

    <div class="dims" title="Viewport size in CSS pixels">
      <input
        type="number"
        aria-label="Width"
        value={pane.width}
        onchange={(e) =>
          onChange(pane.id, {
            width: Number((e.target as HTMLInputElement).value),
            device: 'custom'
          })}
      />
      <span class="x">×</span>
      <input
        type="number"
        aria-label="Height"
        value={pane.height}
        onchange={(e) =>
          onChange(pane.id, {
            height: Number((e.target as HTMLInputElement).value),
            device: 'custom'
          })}
      />
    </div>

    <input
      class="pane-url"
      value={pane.currentUrl ?? pane.url}
      onkeydown={(e) => {
        if (e.key === 'Enter') wv?.loadURL(normalizeUrl((e.target as HTMLInputElement).value))
      }}
    />

    <button
      class="btn-icon"
      title="DevTools"
      aria-label="DevTools"
      onclick={() => wv?.openDevTools()}
    >
      <Code />
    </button>

    <button
      class={`sync ${pane.mirror ? 'on' : ''}`}
      aria-pressed={pane.mirror}
      title={pane.mirror ? 'Synced — mirroring with other panes' : 'Detached from mirroring'}
      onclick={() => onChange(pane.id, { mirror: !pane.mirror })}
    >
      {#if pane.mirror}<Link />{:else}<LinkBreak />{/if}
    </button>

    {#if canClose}
      <button
        class="btn-icon"
        title="Close pane"
        aria-label="Close pane"
        onclick={() => onClose(pane.id)}
      >
        <X />
      </button>
    {/if}
  </div>

  <div class="pane-stage" bind:this={stage}>
    <div class="frame" style={`width:${frameW}px;height:${frameH}px`}>
      <div
        class="viewport"
        bind:this={viewport}
        style={`width:${pane.width}px;height:${viewportH}px;transform:scale(${scale})`}
      ></div>
    </div>
  </div>
</div>
