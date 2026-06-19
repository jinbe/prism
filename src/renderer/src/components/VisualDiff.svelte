<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import pixelmatch from 'pixelmatch'
  import { X } from '../lib/icons'

  interface Side {
    id: string
    label: string
  }
  interface Props {
    a: Side
    b: Side
    capture: (id: string) => Promise<string | null>
    onClose: () => void
  }
  let { a, b, capture, onClose }: Props = $props()

  let canvas: HTMLCanvasElement
  let phase = $state<'loading' | 'ready' | 'error'>('loading')
  let message = $state('')
  let mode = $state<'diff' | 'a' | 'b'>('diff')
  let live = $state(true)
  let diffPct = $state(0)

  let dims = { w: 0, h: 0 }
  let imgA: ImageData | null = null
  let imgB: ImageData | null = null
  let imgDiff: ImageData | null = null

  let timer: ReturnType<typeof setTimeout> | undefined
  let loopGen = 0
  let destroyed = false

  const INTERVAL = 350

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('could not decode capture'))
      img.src = src
    })
  }

  function toImageData(img: HTMLImageElement, w: number, h: number): ImageData {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    // Crop the shared top-left region 1:1 rather than scaling, so captures of
    // differing size (e.g. different device-pixel-ratio) aren't stretched into
    // false diffs.
    ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  }

  function draw(): void {
    const data = mode === 'a' ? imgA : mode === 'b' ? imgB : imgDiff
    if (!canvas || !data) return
    canvas.width = dims.w
    canvas.height = dims.h
    canvas.getContext('2d')!.putImageData(data, 0, 0)
  }

  // One capture+diff pass. `initial` owns the loading/error UI; live ticks update
  // silently and keep the last good frame if a capture momentarily fails.
  async function snapshot(initial: boolean): Promise<void> {
    if (initial) phase = 'loading'
    const [da, db] = await Promise.all([capture(a.id), capture(b.id)])
    if (destroyed) return
    if (!da || !db) {
      if (initial) {
        phase = 'error'
        message = 'Could not capture one of the panes. Make sure both are loaded.'
      }
      return
    }
    try {
      const [ia, ib] = await Promise.all([loadImage(da), loadImage(db)])
      const w = Math.min(ia.naturalWidth, ib.naturalWidth)
      const h = Math.min(ia.naturalHeight, ib.naturalHeight)
      dims = { w, h }
      imgA = toImageData(ia, w, h)
      imgB = toImageData(ib, w, h)
      const out = new ImageData(w, h)
      const mismatch = pixelmatch(imgA.data, imgB.data, out.data, w, h, {
        threshold: 0.1,
        alpha: 0.4,
        diffColor: [232, 122, 65] // brass, so diffs read as the app's signal colour
      })
      imgDiff = out
      diffPct = w && h ? (mismatch / (w * h)) * 100 : 0
      phase = 'ready'
      draw()
    } catch (e) {
      if (initial) {
        phase = 'error'
        message = (e as Error).message
      }
    }
  }

  // A generation id makes stopLoop authoritative: any loop whose gen is stale
  // exits, so toggling Live off then on mid-capture can't leave two loops running.
  function stopLoop(): void {
    loopGen++
    if (timer) clearTimeout(timer)
  }
  function startLoop(): void {
    const gen = ++loopGen
    const loop = async (): Promise<void> => {
      if (gen !== loopGen || destroyed) return
      await snapshot(false)
      if (gen !== loopGen || destroyed) return
      timer = setTimeout(() => void loop(), INTERVAL)
    }
    timer = setTimeout(() => void loop(), INTERVAL)
  }

  // Start/stop the live loop as the toggle (or the first ready frame) changes.
  $effect(() => {
    if (live && phase === 'ready') startLoop()
    else if (!live) stopLoop()
  })

  // Redraw when the view mode changes.
  $effect(() => {
    void mode
    if (phase === 'ready') draw()
  })

  onMount(() => {
    void snapshot(true)
  })
  onDestroy(() => {
    destroyed = true
    stopLoop()
  })
</script>

<div class="vdiff">
  <div class="vdiff-head">
    <span class="panel-title">Visual diff<span class="sub">{a.label} vs {b.label}</span></span>

    {#if phase === 'ready'}
      <div class="seg-row">
        <button class={`seg sm ${mode === 'diff' ? 'on' : ''}`} onclick={() => (mode = 'diff')}>
          Diff
        </button>
        <button class={`seg sm ${mode === 'a' ? 'on' : ''}`} onclick={() => (mode = 'a')}>
          {a.label}
        </button>
        <button class={`seg sm ${mode === 'b' ? 'on' : ''}`} onclick={() => (mode = 'b')}>
          {b.label}
        </button>
      </div>
      <span class="net-chip"><span class="lbl">{diffPct.toFixed(2)}%</span> changed</span>
    {/if}

    <div class="spacer"></div>
    <button
      class={`seg sm ${live ? 'on' : ''}`}
      aria-pressed={live}
      title="Re-capture continuously"
      onclick={() => (live = !live)}
    >
      <span class={`live-dot ${live ? 'on' : ''}`}></span>
      Live
    </button>
    {#if !live}
      <button class="btn" onclick={() => void snapshot(false)}>Recapture</button>
    {/if}
    <button class="btn-icon" title="Close" aria-label="Close" onclick={onClose}>
      <X />
    </button>
  </div>

  <div class="vdiff-body">
    {#if phase === 'loading'}
      <div class="vdiff-msg">Capturing panes…</div>
    {:else if phase === 'error'}
      <div class="vdiff-msg bad">{message}</div>
    {/if}
    <canvas class="vdiff-canvas" class:hidden={phase !== 'ready'} bind:this={canvas}></canvas>
  </div>
</div>
