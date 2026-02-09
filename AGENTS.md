# AGENTS.md

## Project

Tauri v2 desktop app — Rust backend + SvelteKit frontend. Plays keyboard sounds.

## Structure

```
src/                      # Frontend (SvelteKit + Svelte 5)
  routes/+page.svelte     # Main UI
src-tauri/                # Rust backend
  src/lib.rs              # Tauri setup, tray, IPC commands
  src/sound_engine.rs     # Kira audio manager, sound loading/playback
  src/sound_pack.rs       # Pack manifest parsing, key→sound resolution
  src/keyboard.rs         # rdev global keyboard listener
  resources/soundpacks/   # Bundled sound packs (each has pack.json + sounds/)
scripts/                  # Build helpers (TypeScript via tsx)
```

## Commands

| Task         | Command                |
| ------------ | ---------------------- |
| Dev          | `npm run tauri:dev`    |
| Build        | `npm run tauri:build`  |
| Lint         | `npm run lint`         |
| Lint fix     | `npm run lint:fix`     |
| Format       | `npm run format`       |
| Format check | `npm run format:check` |

## Lint & Format Rules

- **Frontend**: ESLint (flat config) + eslint-plugin-svelte + eslint-plugin-unused-imports (auto-deletes unused imports on fix). Formatter: oxfmt (JS/TS/JSON/CSS only, not .svelte).
- **Rust**: `cargo clippy -- -D warnings` for lint, `cargo fmt` for format.
- Both are combined in `npm run lint` and `npm run format`.

## Build Notes

- Rust toolchain: `stable-x86_64-pc-windows-gnu` (MinGW, not MSVC)
- MinGW bin dir must be on PATH before cargo bin for builds
- `svelte.config.js` must stay as JS (SvelteKit requirement)
