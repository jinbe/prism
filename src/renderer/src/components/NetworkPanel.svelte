<script lang="ts">
  import { buildRows, formatBytes, type NetStore, type Row } from '../netStore'
  import BodyDiff from './BodyDiff.svelte'
  import { X } from '../lib/icons'

  interface Col {
    id: string
    label: string
  }
  interface Props {
    data: NetStore
    cols: Col[]
    tick: number
    onClear: () => void
    onClose: () => void
  }

  let { data, cols, tick, onClear, onClose }: Props = $props()

  let onlyDiff = $state(false)
  let selected = $state<{ row: Row; a: Col; b: Col } | null>(null)

  const rows = $derived(
    buildRows(
      data,
      cols.map((c) => c.id),
      tick
    )
  )
  const shown = $derived(onlyDiff ? rows.filter((r) => r.diff) : rows)

  const summary = $derived(
    cols.map((c) => {
      let total = 0
      let bytes = 0
      let fails = 0
      const m = data.get(c.id)
      if (m) {
        for (const r of m.values()) {
          total++
          bytes += r.size ?? 0
          if (r.failed) fails++
        }
      }
      return { ...c, total, bytes, fails }
    })
  )

  function cellText(row: Row, colId: string): string {
    const cell = row.cells[colId]
    if (!cell) return '·'
    if (cell.failed) return 'failed'
    const status = cell.status != null ? String(cell.status) : '…'
    const size = cell.size ? ` · ${formatBytes(cell.size)}` : ''
    const dup = cell.count > 1 ? ` ×${cell.count}` : ''
    return `${status}${size}${dup}`
  }

  function openDiff(row: Row): void {
    const present = cols.filter((c) => row.cells[c.id])
    if (present.length < 2) return
    selected = { row, a: present[0], b: present[1] }
  }
</script>

<div class="netpanel">
  <div class="net-head">
    <span class="panel-title">Network<span class="sub">cross-pane diff</span></span>

    <div class="net-summary">
      {#each summary as s (s.id)}
        <span class="net-chip" title={s.label}>
          <span class="lbl">{s.label}</span>
          {s.total} req · {formatBytes(s.bytes)}{#if s.fails}
            · <span class="bad">{s.fails} failed</span>{/if}
        </span>
      {/each}
    </div>

    <div class="spacer"></div>
    <button
      class={`seg ${onlyDiff ? 'on' : ''}`}
      aria-pressed={onlyDiff}
      onclick={() => (onlyDiff = !onlyDiff)}
    >
      Only differences
    </button>
    <button class="btn" onclick={onClear}>Clear</button>
    <button class="btn-icon" title="Close" aria-label="Close" onclick={onClose}>
      <X />
    </button>
  </div>

  <div class="net-table-wrap">
    <table class="net-table">
      <thead>
        <tr>
          <th class="col-method">Method</th>
          <th class="col-path">Path</th>
          {#each cols as c (c.id)}
            <th>{c.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each shown as row (row.key)}
          <tr
            class={row.diff ? 'diff' : ''}
            onclick={() => openDiff(row)}
            title="Click to diff response bodies"
          >
            <td class="col-method">{row.method}</td>
            <td class="col-path" title={row.path}>{row.path}</td>
            {#each cols as c (c.id)}
              <td
                class={`cell ${row.cells[c.id] ? (row.cells[c.id].failed ? 'bad' : '') : 'absent'}`}
              >
                {cellText(row, c.id)}
              </td>
            {/each}
          </tr>
        {/each}
        {#if shown.length === 0}
          <tr>
            <td colspan={cols.length + 2}>
              <div class="empty">
                <b>{onlyDiff ? 'No differences' : 'Nothing captured yet'}</b>
                {onlyDiff
                  ? 'Every shared request matched across panes.'
                  : 'Navigate a pane and requests will line up here, side by side.'}
              </div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if selected}
    <BodyDiff
      path={selected.row.path}
      labelA={selected.a.label}
      labelB={selected.b.label}
      paneAId={selected.a.id}
      paneBId={selected.b.id}
      reqA={selected.row.cells[selected.a.id]?.requestId}
      reqB={selected.row.cells[selected.b.id]?.requestId}
      onClose={() => (selected = null)}
    />
  {/if}
</div>
