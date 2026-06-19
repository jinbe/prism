<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { FileDiff } from '@pierre/diffs'

  interface Props {
    path: string
    labelA: string
    labelB: string
    paneAId: string
    paneBId: string
    reqA?: string
    reqB?: string
    onClose: () => void
  }

  let { path, labelA, labelB, paneAId, paneBId, reqA, reqB, onClose }: Props = $props()

  let container: HTMLDivElement
  let phase = $state<'loading' | 'ready' | 'error'>('loading')
  let message = $state('')
  let identical = $state(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let diff: any = null

  function fileName(p: string): string {
    const base = p.split('?')[0].split('/').pop() || 'response'
    return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.json`
  }

  function pretty(s: string): string {
    try {
      return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
      return s
    }
  }

  function decode(r: { body: string; base64Encoded: boolean }): string {
    return r.base64Encoded ? atob(r.body) : r.body
  }

  onMount(async () => {
    if (!reqA || !reqB) {
      phase = 'error'
      message = 'Both panes need this request to diff its body.'
      return
    }
    const [a, b] = await Promise.all([
      window.api.netInspect.getBody(paneAId, reqA),
      window.api.netInspect.getBody(paneBId, reqB)
    ])
    if (!a || !b) {
      phase = 'error'
      message =
        'Response body unavailable — it may have been evicted from the cache, was a redirect/204, or DevTools is open on a pane (that detaches the inspector).'
      return
    }
    const aText = pretty(decode(a))
    const bText = pretty(decode(b))
    identical = aText === bText
    const name = fileName(path)
    try {
      diff = new FileDiff({ theme: 'github-dark' })
      diff.render({
        oldFile: { name: `${name}  ·  ${labelA}`, contents: aText },
        newFile: { name: `${name}  ·  ${labelB}`, contents: bText },
        fileContainer: container
      })
      phase = 'ready'
    } catch (err) {
      phase = 'error'
      message = `Failed to render diff: ${(err as Error).message}`
    }
  })

  onDestroy(() => {
    try {
      diff?.cleanUp()
    } catch {
      /* ignore */
    }
  })
</script>

<div class="bodydiff">
  <div class="bodydiff-head">
    <strong>Response diff</strong>
    <span class="dim">{path}</span>
    {#if identical}<span class="net-chip">bodies identical</span>{/if}
    <div class="spacer"></div>
    <button class="btn icon" title="Close" onclick={onClose}>✕</button>
  </div>
  {#if phase === 'loading'}
    <div class="bodydiff-msg dim">Fetching response bodies…</div>
  {:else if phase === 'error'}
    <div class="bodydiff-msg bad">{message}</div>
  {/if}
  <div class="bodydiff-body" bind:this={container}></div>
</div>
