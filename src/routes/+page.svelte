<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open } from "@tauri-apps/plugin-dialog";
  import { LazyStore } from "@tauri-apps/plugin-store";
  import { onMount } from "svelte";

  interface SoundPackInfo {
    id: string;
    name: string;
    author: string;
    description: string;
    source: string | null;
  }

  interface SlotInfo {
    slot: string;
    label: string;
    file_name: string | null;
  }

  type Tab = "packs" | "custom";

  let enabled = $state(true);
  let volume = $state(0.8);
  let packs = $state<SoundPackInfo[]>([]);
  let orderedPacks = $state<SoundPackInfo[]>([]);
  let activePackId = $state<string | null>(null);
  let loading = $state(true);
  let activeTab = $state<Tab>("packs");

  // Reorder state
  const store = new LazyStore("settings.json");

  // Custom tab state
  let newPackName = $state("");
  let newPackSlots = $state<Record<string, string | null>>({
    default: null,
    space: null,
    enter: null,
    modifier: null,
    backspace: null,
  });
  let creating = $state(false);
  let importingSlot = $state<string | null>(null);

  // Editing existing custom pack
  let editingPack = $state<SoundPackInfo | null>(null);
  let editSlots = $state<SlotInfo[]>([]);

  // Delete confirmation
  let deletingPackId = $state<string | null>(null);

  const SLOT_LABELS: Record<string, string> = {
    default: "Default Key",
    space: "Space",
    enter: "Enter",
    modifier: "Modifiers",
    backspace: "Backspace / Delete",
  };

  let customPacks = $derived(packs.filter((p) => p.source === "user"));

  onMount(async () => {
    try {
      enabled = await invoke<boolean>("get_enabled");
      volume = await invoke<number>("get_volume");
      packs = await invoke<SoundPackInfo[]>("get_sound_packs");
      orderedPacks = await applyPackOrder(packs);
      activePackId = await invoke<string | null>("get_active_pack_id");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    loading = false;
  });

  async function refreshPacks() {
    packs = await invoke<SoundPackInfo[]>("get_sound_packs");
    orderedPacks = await applyPackOrder(packs);
  }

  async function hideToTray() {
    try {
      await invoke("hide_to_tray");
    } catch (e) {
      console.error("Failed to hide to tray:", e);
    }
  }

  async function handleToggle() {
    try {
      enabled = await invoke<boolean>("toggle_sound");
    } catch (e) {
      console.error("Failed to toggle sound:", e);
    }
  }

  async function handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    volume = parseFloat(target.value);
    try {
      await invoke("set_volume", { volume });
    } catch (err) {
      console.error("Failed to set volume:", err);
    }
  }

  const DOM_TO_RDEV: Record<string, string> = {
    Enter: "Return",
    NumpadEnter: "Return",
  };

  function domKeyToRdev(code: string): string {
    return DOM_TO_RDEV[code] ?? code;
  }

  function handleTestKeydown(e: KeyboardEvent) {
    const key = domKeyToRdev(e.code);
    invoke("play_sound", { key }).catch(() => {});
  }

  // --- Pack order persistence ---

  async function applyPackOrder(packList: SoundPackInfo[]): Promise<SoundPackInfo[]> {
    const savedOrder = await store.get<string[]>("packOrder");
    if (!savedOrder || savedOrder.length === 0) return packList;

    const placed: Record<string, boolean> = {};
    const ordered: SoundPackInfo[] = [];

    for (const id of savedOrder) {
      const pack = packList.find((p) => p.id === id);
      if (pack) {
        ordered.push(pack);
        placed[id] = true;
      }
    }

    // Append new packs not in saved order
    for (const pack of packList) {
      if (!placed[pack.id]) {
        ordered.push(pack);
      }
    }

    return ordered;
  }

  async function savePackOrder(packList: SoundPackInfo[]) {
    await store.set("packOrder", packList.map((p) => p.id));
  }

  function movePack(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const updated = [...orderedPacks];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    orderedPacks = updated;
    savePackOrder(updated);
  }

  function movePackUp(index: number) {
    if (index > 0) movePack(index, index - 1);
  }

  function movePackDown(index: number) {
    if (index < orderedPacks.length - 1) movePack(index, index + 1);
  }

  async function handlePackSelect(packId: string) {
    try {
      await invoke("set_active_pack", { packId });
      activePackId = packId;
    } catch (e) {
      console.error("Failed to set pack:", e);
    }
  }

  // --- New pack creation (with file slots) ---

  async function handlePickNewSlot(slot: string) {
    importingSlot = slot;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg"] }],
      });
      if (selected) {
        newPackSlots[slot] = selected as string;
      }
    } catch (e) {
      console.error("Failed to pick file:", e);
    }
    importingSlot = null;
  }

  function clearNewSlot(slot: string) {
    newPackSlots[slot] = null;
  }

  function resetNewPackForm() {
    newPackName = "";
    newPackSlots = {
      default: null,
      space: null,
      enter: null,
      modifier: null,
      backspace: null,
    };
  }

  function fileName(path: string | null): string | null {
    if (!path) return null;
    const parts = path.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] ?? null;
  }

  async function handleCreatePack() {
    if (!newPackName.trim()) return;

    // Must have at least the default slot
    const hasDefault = newPackSlots.default;
    if (!hasDefault) {
      alert("Default Key sound is required.");
      return;
    }

    creating = true;
    try {
      const pack = await invoke<SoundPackInfo>("create_custom_pack", {
        name: newPackName.trim(),
      });

      // Import all selected files into slots
      for (const [slot, filePath] of Object.entries(newPackSlots)) {
        if (filePath) {
          await invoke("import_sound_file", {
            packId: pack.id,
            slot,
            filePath,
          });
        }
      }

      await refreshPacks();
      await handlePackSelect(pack.id);
      resetNewPackForm();
    } catch (e) {
      console.error("Failed to create pack:", e);
      alert(`Failed to create pack: ${e}`);
    }
    creating = false;
  }

  // --- Edit existing custom pack ---

  async function startEdit(pack: SoundPackInfo) {
    if (editingPack?.id === pack.id) {
      editingPack = null;
      editSlots = [];
      return;
    }
    try {
      editSlots = await invoke<SlotInfo[]>("get_custom_pack_slots", {
        packId: pack.id,
      });
      editingPack = pack;
    } catch (e) {
      console.error("Failed to load slots:", e);
    }
  }

  async function handleImportSlot(packId: string, slot: string) {
    importingSlot = slot;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg"] }],
      });
      if (selected) {
        await invoke("import_sound_file", {
          packId,
          slot,
          filePath: selected,
        });
        editSlots = await invoke<SlotInfo[]>("get_custom_pack_slots", {
          packId,
        });
      }
    } catch (e) {
      console.error("Failed to import sound:", e);
      alert(`Failed to import: ${e}`);
    }
    importingSlot = null;
  }

  async function handleRemoveSlot(packId: string, slot: string) {
    try {
      await invoke("remove_sound_slot", { packId, slot });
      editSlots = await invoke<SlotInfo[]>("get_custom_pack_slots", {
        packId,
      });
    } catch (e) {
      console.error("Failed to remove slot:", e);
      alert(`Failed to remove: ${e}`);
    }
  }

  async function handleDeletePack(packId: string) {
    try {
      await invoke("delete_custom_pack", { packId });
      deletingPackId = null;
      if (editingPack?.id === packId) {
        editingPack = null;
        editSlots = [];
      }
      if (activePackId === packId) {
        activePackId = "default";
      }
      await refreshPacks();
    } catch (e) {
      console.error("Failed to delete pack:", e);
      alert(`Failed to delete: ${e}`);
    }
  }
</script>

<main>
  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <header>
      <h1>KeySound</h1>
      <p class="subtitle">Keyboard Sound Effects</p>
      <button class="tray-btn" onclick={hideToTray}>Minimize to Tray</button>
    </header>

    <section class="test-section">
      <input
        type="text"
        class="test-input"
        placeholder="Type here to test sounds..."
        onkeydown={handleTestKeydown}
      />
    </section>

    <section class="control-section">
      <div class="control-row">
        <span class="label">Sound</span>
        <button class="toggle-btn" class:active={enabled} onclick={handleToggle}>
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      <div class="control-row">
        <span class="label">Volume</span>
        <div class="volume-control">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            oninput={handleVolumeChange}
            class="volume-slider"
          />
          <span class="volume-value">{Math.round(volume * 100)}%</span>
        </div>
      </div>
    </section>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        class:active={activeTab === "packs"}
        onclick={() => (activeTab = "packs")}
      >
        Sound Packs
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === "custom"}
        onclick={() => (activeTab = "custom")}
      >
        Custom Sound
      </button>
    </div>

    <!-- Tab: Sound Packs (all packs) -->
    {#if activeTab === "packs"}
      <section class="packs-section">
        {#if orderedPacks.length === 0}
          <p class="no-packs">No sound packs found</p>
        {:else}
          <div class="pack-list">
            {#each orderedPacks as pack, i (pack.id)}
              <div
                class="pack-card"
                class:selected={activePackId === pack.id}
                role="button"
                tabindex="0"
                onclick={() => handlePackSelect(pack.id)}
                onkeydown={(e) => e.key === "Enter" && handlePackSelect(pack.id)}
              >
                <div class="pack-card-inner">
                  <div class="pack-info">
                    <div class="pack-name">
                      {pack.name}
                      {#if pack.source === "user"}
                        <span class="custom-badge">Custom</span>
                      {/if}
                    </div>
                    <div class="pack-author">{pack.author}</div>
                    {#if pack.description}
                      <div class="pack-desc">{pack.description}</div>
                    {/if}
                  </div>
                  <div class="reorder-buttons">
                    <button
                      class="reorder-btn"
                      title="Move up"
                      disabled={i === 0}
                      onclick={(e) => { e.stopPropagation(); movePackUp(i); }}
                    >&#x25B2;</button>
                    <button
                      class="reorder-btn"
                      title="Move down"
                      disabled={i === orderedPacks.length - 1}
                      onclick={(e) => { e.stopPropagation(); movePackDown(i); }}
                    >&#x25BC;</button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Tab: Custom Sound -->
    {#if activeTab === "custom"}
      <section class="custom-section">
        <!-- New pack form -->
        <div class="new-pack-form">
          <h3>Create New Custom Sound</h3>
          <input
            type="text"
            class="name-input"
            placeholder="Sound pack name..."
            bind:value={newPackName}
          />

          <div class="slot-list">
            {#each Object.entries(SLOT_LABELS) as [slot, label] (slot)}
              <div class="slot-row">
                <span class="slot-label">
                  {label}
                  {#if slot === "default"}<span class="required">*</span>{/if}
                </span>
                <div class="slot-controls">
                  {#if newPackSlots[slot]}
                    <span class="slot-file">{fileName(newPackSlots[slot])}</span>
                    <button class="action-btn remove-btn" onclick={() => clearNewSlot(slot)}>
                      X
                    </button>
                  {:else}
                    <span class="slot-file empty">None</span>
                  {/if}
                  <button
                    class="action-btn choose-btn"
                    onclick={() => handlePickNewSlot(slot)}
                    disabled={importingSlot === slot}
                  >
                    {importingSlot === slot ? "..." : "Choose File"}
                  </button>
                </div>
              </div>
            {/each}
          </div>

          <p class="slot-hint">
            Default Key is required. Other slots are optional — keys without a
            specific sound will use the Default Key sound.
          </p>

          <button
            class="create-btn"
            onclick={handleCreatePack}
            disabled={creating || !newPackName.trim() || !newPackSlots.default}
          >
            {creating ? "Creating..." : "Create & Use"}
          </button>
        </div>

        <!-- Existing custom packs -->
        {#if customPacks.length > 0}
          <h3 class="section-title">Your Custom Sounds</h3>
          <div class="pack-list">
            {#each customPacks as pack (pack.id)}
              <div class="pack-wrapper">
                <div
                  class="pack-card"
                  class:selected={activePackId === pack.id}
                  role="button"
                  tabindex="0"
                  onclick={() => handlePackSelect(pack.id)}
                  onkeydown={(e) => e.key === "Enter" && handlePackSelect(pack.id)}
                >
                  <div class="pack-top-row">
                    <div class="pack-name">{pack.name}</div>
                    <div class="pack-actions">
                      <button
                        class="action-btn edit-btn"
                        onclick={(e) => { e.stopPropagation(); startEdit(pack); }}
                      >
                        {editingPack?.id === pack.id ? "Save" : "Edit"}
                      </button>
                      <button
                        class="action-btn delete-btn"
                        onclick={(e) => { e.stopPropagation(); deletingPackId = pack.id; }}
                      >
                        Del
                      </button>
                    </div>
                  </div>
                </div>

                {#if deletingPackId === pack.id}
                  <div class="delete-confirm">
                    <span>Delete "{pack.name}"?</span>
                    <div class="delete-actions">
                      <button
                        class="action-btn delete-yes"
                        onclick={() => handleDeletePack(pack.id)}
                      >
                        Yes
                      </button>
                      <button
                        class="action-btn"
                        onclick={() => (deletingPackId = null)}
                      >
                        No
                      </button>
                    </div>
                  </div>
                {/if}

                {#if editingPack?.id === pack.id}
                  <div class="slot-editor">
                    {#each editSlots as slot (slot.slot)}
                      <div class="slot-row">
                        <span class="slot-label">{slot.label}</span>
                        <div class="slot-controls">
                          <span class="slot-file" class:empty={!slot.file_name}>
                            {slot.file_name ?? "None"}
                          </span>
                          <button
                            class="action-btn choose-btn"
                            onclick={() => handleImportSlot(pack.id, slot.slot)}
                            disabled={importingSlot === slot.slot}
                          >
                            {importingSlot === slot.slot ? "..." : "Choose File"}
                          </button>
                          {#if slot.file_name}
                            <button
                              class="action-btn remove-btn"
                              onclick={() => handleRemoveSlot(pack.id, slot.slot)}
                            >
                              X
                            </button>
                          {/if}
                        </div>
                      </div>
                    {/each}
                    <p class="slot-hint">
                      Keys without a sound assigned will use the Default Key sound.
                      If Default Key is also empty, those keys will be silent.
                    </p>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <footer>
      <p class="hint">Use "Minimize to Tray" to keep running in background</p>
      <p class="credits">
        Sound effects: <a href="https://soundeffect-lab.info/" target="_blank" rel="noopener">効果音ラボ</a>
      </p>
    </footer>

    <button class="go-top" onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      Top
    </button>
  {/if}
</main>

<style>
  :root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #e0e0e0;
    background-color: #1a1a2e;
    -webkit-font-smoothing: antialiased;
  }

  :global(body) {
    margin: 0;
    padding: 0;
  }

  main {
    padding: 24px;
    max-width: 440px;
    margin: 0 auto;
    user-select: none;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 1.2em;
    color: #888;
  }

  header {
    text-align: center;
    margin-bottom: 32px;
  }

  h1 {
    margin: 0;
    font-size: 1.8em;
    font-weight: 700;
    color: #fff;
  }

  .subtitle {
    margin: 4px 0 0;
    color: #888;
    font-size: 0.9em;
  }

  .tray-btn {
    margin-top: 12px;
    padding: 6px 16px;
    border: 1px solid #444;
    border-radius: 6px;
    background: transparent;
    color: #888;
    font-size: 0.8em;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tray-btn:hover {
    background: #0f3460;
    color: #53c0f0;
    border-color: #53c0f0;
  }

  h3 {
    font-size: 1em;
    font-weight: 600;
    color: #ccc;
    margin: 0 0 12px;
  }

  .test-section {
    margin-bottom: 16px;
  }

  .test-input {
    width: 100%;
    padding: 12px 16px;
    background: #16213e;
    border: 2px solid #1a1a3e;
    border-radius: 10px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 0.95em;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .test-input::placeholder {
    color: #555;
  }

  .test-input:focus {
    border-color: #53c0f0;
  }

  .control-section {
    background: #16213e;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
  }

  .control-row + .control-row {
    border-top: 1px solid #1a1a3e;
  }

  .label {
    font-weight: 500;
    color: #ccc;
  }

  .toggle-btn {
    padding: 6px 20px;
    border: none;
    border-radius: 6px;
    font-size: 0.85em;
    font-weight: 600;
    cursor: pointer;
    background: #333;
    color: #888;
    transition: all 0.2s;
  }

  .toggle-btn.active {
    background: #0f3460;
    color: #53c0f0;
  }

  .toggle-btn:hover {
    opacity: 0.85;
  }

  .volume-control {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .volume-slider {
    width: 160px;
    accent-color: #53c0f0;
  }

  .volume-value {
    font-size: 0.85em;
    color: #888;
    min-width: 36px;
    text-align: right;
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    gap: 0;
    margin-bottom: 16px;
    border-bottom: 2px solid #1a1a3e;
  }

  .tab-btn {
    flex: 1;
    padding: 10px 0;
    border: none;
    background: transparent;
    color: #666;
    font-size: 0.9em;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
  }

  .tab-btn.active {
    color: #53c0f0;
    border-bottom-color: #53c0f0;
  }

  .tab-btn:hover:not(.active) {
    color: #aaa;
  }

  /* Packs section */
  .packs-section {
    margin-bottom: 24px;
  }

  .no-packs {
    color: #666;
    text-align: center;
    padding: 24px;
  }

  .pack-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pack-wrapper {
    display: flex;
    flex-direction: column;
  }

  .pack-card {
    display: block;
    width: 100%;
    text-align: left;
    background: #16213e;
    border: 2px solid transparent;
    border-radius: 10px;
    padding: 14px 18px;
    cursor: pointer;
    transition: all 0.2s;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    box-sizing: border-box;
  }

  .pack-card:hover {
    background: #1a2744;
  }

  .pack-card.selected {
    border-color: #53c0f0;
    background: #0f3460;
  }

  .pack-card-inner {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pack-info {
    flex: 1;
    min-width: 0;
  }

  .reorder-buttons {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .reorder-btn {
    padding: 2px 6px;
    border: 1px solid #333;
    border-radius: 3px;
    background: transparent;
    color: #666;
    font-size: 0.65em;
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
    transition: all 0.15s;
  }

  .reorder-btn:hover:not(:disabled) {
    background: #0f3460;
    color: #53c0f0;
    border-color: #53c0f0;
  }

  .reorder-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .pack-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pack-name {
    font-weight: 600;
    font-size: 1em;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .custom-badge {
    font-size: 0.65em;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: #2a4a3a;
    color: #6fcf97;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pack-actions {
    display: flex;
    gap: 4px;
  }

  .pack-author {
    font-size: 0.8em;
    color: #888;
    margin-top: 2px;
  }

  .pack-desc {
    font-size: 0.85em;
    color: #aaa;
    margin-top: 4px;
  }

  /* Custom section */
  .custom-section {
    margin-bottom: 24px;
  }

  .section-title {
    margin-top: 24px;
  }

  .new-pack-form {
    background: #16213e;
    border-radius: 12px;
    padding: 18px 20px;
  }

  .new-pack-form h3 {
    margin-bottom: 14px;
  }

  .name-input {
    width: 100%;
    padding: 10px 14px;
    background: #12192e;
    border: 2px solid #1a1a3e;
    border-radius: 8px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: 0.9em;
    outline: none;
    box-sizing: border-box;
    margin-bottom: 14px;
    transition: border-color 0.2s;
  }

  .name-input:focus {
    border-color: #53c0f0;
  }

  .slot-list {
    margin-bottom: 14px;
  }

  .slot-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 0;
  }

  .slot-row + .slot-row {
    border-top: 1px solid #1a1a3e;
  }

  .slot-label {
    font-size: 0.8em;
    color: #aaa;
    min-width: 110px;
  }

  .required {
    color: #e74c3c;
    margin-left: 2px;
  }

  .slot-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .slot-file {
    font-size: 0.75em;
    color: #999;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot-file.empty {
    color: #555;
  }

  .slot-hint {
    font-size: 0.75em;
    color: #666;
    margin: 8px 0 4px;
    line-height: 1.4;
  }

  .action-btn {
    padding: 3px 8px;
    border: 1px solid #444;
    border-radius: 4px;
    background: transparent;
    color: #aaa;
    font-size: 0.75em;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: #2a2a4a;
    color: #ddd;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .choose-btn:hover {
    border-color: #53c0f0;
    color: #53c0f0;
  }

  .edit-btn:hover {
    border-color: #53c0f0;
    color: #53c0f0;
  }

  .remove-btn:hover {
    border-color: #e74c3c;
    color: #e74c3c;
  }

  .delete-btn:hover {
    border-color: #e74c3c;
    color: #e74c3c;
  }

  .create-btn {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: #1a8cff;
    color: #fff;
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
  }

  .create-btn:hover:not(:disabled) {
    background: #3da0ff;
  }

  .create-btn:disabled {
    background: #1a2744;
    color: #555;
    cursor: default;
  }

  /* Delete confirmation */
  .delete-confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 18px;
    background: #2a1a1a;
    border: 1px solid #e74c3c33;
    border-radius: 0 0 10px 10px;
    margin-top: -2px;
    font-size: 0.85em;
    color: #e74c3c;
  }

  .delete-actions {
    display: flex;
    gap: 6px;
  }

  .delete-yes {
    border-color: #e74c3c;
    color: #e74c3c;
  }

  .delete-yes:hover {
    background: #e74c3c;
    color: #fff;
  }

  /* Slot editor (for existing packs) */
  .slot-editor {
    background: #12192e;
    border: 1px solid #1a1a3e;
    border-radius: 0 0 10px 10px;
    margin-top: -2px;
    padding: 8px 14px;
  }

  footer {
    text-align: center;
    padding-top: 8px;
  }

  .hint {
    color: #555;
    font-size: 0.8em;
  }

  .credits {
    color: #555;
    font-size: 0.75em;
    margin-top: 4px;
  }

  .credits a {
    color: #53c0f0;
    text-decoration: none;
  }

  .credits a:hover {
    text-decoration: underline;
  }

  .go-top {
    position: fixed;
    bottom: 16px;
    right: 16px;
    padding: 6px 14px;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 6px;
    color: #888;
    font-size: 0.8em;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 100;
  }

  .go-top:hover {
    background: #fff;
    color: #555;
    border-color: #999;
  }
</style>
