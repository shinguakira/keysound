<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";

  interface SoundPackInfo {
    id: string;
    name: string;
    author: string;
    description: string;
  }

  let enabled = $state(true);
  let volume = $state(0.8);
  let packs = $state<SoundPackInfo[]>([]);
  let activePackId = $state<string | null>(null);
  let loading = $state(true);

  onMount(async () => {
    try {
      enabled = await invoke<boolean>("get_enabled");
      volume = await invoke<number>("get_volume");
      packs = await invoke<SoundPackInfo[]>("get_sound_packs");
      activePackId = await invoke<string | null>("get_active_pack_id");
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
    loading = false;
  });

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

  async function handlePackSelect(packId: string) {
    try {
      await invoke("set_active_pack", { packId });
      activePackId = packId;
    } catch (e) {
      console.error("Failed to set pack:", e);
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

    <section class="packs-section">
      <h2>Sound Packs</h2>
      {#if packs.length === 0}
        <p class="no-packs">No sound packs found</p>
      {:else}
        <div class="pack-list">
          {#each packs as pack (pack.id)}
            <button
              class="pack-card"
              class:selected={activePackId === pack.id}
              onclick={() => handlePackSelect(pack.id)}
            >
              <div class="pack-name">{pack.name}</div>
              <div class="pack-author">{pack.author}</div>
              <div class="pack-desc">{pack.description}</div>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <footer>
      <p class="hint">Close this window to minimize to tray</p>
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

  h2 {
    font-size: 1.1em;
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
  }

  .pack-card:hover {
    background: #1a2744;
  }

  .pack-card.selected {
    border-color: #53c0f0;
    background: #0f3460;
  }

  .pack-name {
    font-weight: 600;
    font-size: 1em;
    color: #fff;
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
