<script lang="ts">
  import { Plus, Stack, Trash, SidebarSimple } from '../lib/icons'

  interface Item {
    id: string
    name: string
    count: number
  }
  interface Props {
    workspaces: Item[]
    activeId: string
    onSelect: (id: string) => void
    onAdd: () => void
    onCloseWorkspace: (id: string) => void
    onRename: (id: string, name: string) => void
    onCollapse: () => void
  }
  let { workspaces, activeId, onSelect, onAdd, onCloseWorkspace, onRename, onCollapse }: Props =
    $props()

  let editingId = $state<string | null>(null)
  let draft = $state('')

  function startRename(it: Item): void {
    editingId = it.id
    draft = it.name
  }
  function commit(): void {
    if (editingId && draft.trim()) onRename(editingId, draft.trim())
    editingId = null
  }
  function focusOnMount(node: HTMLInputElement): void {
    node.focus()
    node.select()
  }
</script>

<aside class="rail">
  <div class="rail-head">
    <span class="rail-title">Projects</span>
    <button
      class="btn-icon sm"
      title="Hide projects"
      aria-label="Hide projects"
      onclick={onCollapse}
    >
      <SidebarSimple />
    </button>
  </div>

  <div class="rail-list">
    {#each workspaces as w (w.id)}
      <div class={`rail-item ${w.id === activeId ? 'on' : ''}`}>
        <button
          class="rail-pick"
          onclick={() => onSelect(w.id)}
          ondblclick={() => startRename(w)}
          title={`${w.name} — double-click to rename`}
        >
          <span class="rail-ico"><Stack /></span>
          {#if editingId === w.id}
            <input
              class="rail-edit"
              value={draft}
              use:focusOnMount
              oninput={(e) => (draft = (e.target as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') commit()
                else if (e.key === 'Escape') editingId = null
              }}
              onblur={commit}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span class="rail-name">{w.name}</span>
            <span class="rail-count">{w.count}</span>
          {/if}
        </button>
        {#if workspaces.length > 1}
          <button
            class="rail-x"
            title="Close project"
            aria-label="Close project"
            onclick={() => onCloseWorkspace(w.id)}
          >
            <Trash />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <button class="rail-add" onclick={onAdd}>
    <Plus />
    New project
  </button>
</aside>
