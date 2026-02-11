# KeySound - Requirements Document

## Overview

KeySound is a Windows desktop application that plays sound effects on every keypress, system-wide. Built with Tauri v2 (Rust + Svelte).

---

## Core Features

### 1. Global Keyboard Sound

- Capture all keypresses system-wide via `rdev` (dedicated thread)
- Keydown events only (no keyup)
- Works when app window is minimized or hidden
- Sub-10ms latency from keypress to audio playback

### 2. Sound Packs

- 24 bundled packs (HHKB, Piano, Katana, Gunshot, etc.)
- Bundled packs sync from app resources to `%APPDATA%/com.keysound.desktop/soundpacks/` on every launch
- Default pack: HHKB (id: `"default"`, always sorted first)
- Supported audio formats: mp3, wav, ogg
- Instant pack switching (all sounds pre-loaded into memory on switch)

### 3. Sound Resolution (3-Tier Hierarchy)

For each keypress, resolve which sound file to play:

1. **Key override** - exact key match (e.g., `Space`, `Return`)
2. **Category override** - key belongs to a group (e.g., modifiers, delete keys)
3. **Default** - fallback `defaults.keydown` sound

Volume resolution follows the same 3-tier hierarchy.

### 4. Volume Control

- Master volume slider: 0% - 100% (stored as 0.0 - 1.0)
- Per-key and per-category volume overrides in pack.json
- Final volume = master volume x key volume (converted to dB for playback)
- Default volume: 1.0 (100%)

### 5. Sound Toggle

- Global ON/OFF toggle button
- Also toggleable from system tray menu

---

## Custom Sound Packs

### 6. Create Custom Pack

- User enters a pack name
- Must provide at least the **Default Key** sound (required)
- 5 editable category slots:

| Slot        | Label              | Keys Affected                |
| ----------- | ------------------ | ---------------------------- |
| `default`   | Default Key        | All keys (fallback)          |
| `space`     | Space              | Space                        |
| `enter`     | Enter              | Return, NumpadEnter          |
| `modifier`  | Modifiers          | Shift, Ctrl, Alt, Meta (L+R) |
| `backspace` | Backspace / Delete | Backspace, Delete            |

- Optional **per-key sound assignment** for individual keys (e.g., A, B, C, Digit0)
  - Uses slot naming convention `key:{rdev_key_name}` (e.g., `key:KeyA`, `key:Digit0`)
  - Maps directly to `key_overrides` in pack.json
  - Added via "Press any key..." capture UI in both create and edit forms
  - Keys already covered by category slots (Space, Return) are rejected
  - Sound files stored as `sounds/keydown-key-{KeyName}.{ext}`
  - Per-key overrides take priority over category overrides in sound resolution
- Audio files are **copied** into `%APPDATA%/com.keysound.desktop/user-soundpacks/{pack-id}/sounds/`
- Original files are never referenced after import
- Pack ID generated via slugify (lowercase, dashes) with collision avoidance
- New custom pack default volume: 0.8
- On creation, a silence placeholder WAV is generated (44100 Hz, mono, 16-bit, ~10ms)
- "Create & Use" button: creates pack, imports all selected files, auto-selects as active

### 7. File Import Validation

- Allowed extensions: mp3, wav, ogg
- Max file size: 5 MB
- Native file picker dialog (via `tauri-plugin-dialog`)
- When replacing a file with different extension, old file is deleted (no orphans)
- Original filename stored in `original_names` for UI display

### 8. Edit Custom Pack

- Toggle edit mode per pack (Edit/Save button)
- View all 5 category slots with current file names
- View per-key sound overrides (if any) below category slots
- Add/replace sound in any slot via file picker
- Add per-key sound via "+ Add Key Sound" button (key capture → file picker)
- Remove sound from a slot:
  - Default slot: resets to silence placeholder
  - Category/per-key slots: removes override entirely (falls back to default sound)
- If editing the active pack, sounds are reloaded immediately

### 9. Delete Custom Pack

- Delete confirmation dialog ("Delete {name}?")
- Cancel (No) dismisses dialog
- Confirm (Yes) removes entire pack directory (`remove_dir_all`)
- Cannot delete bundled packs (safety check)
- If deleting the active pack, auto-switch to default

### 10. Pack List Ordering

Display order in both tabs:

1. Default (HHKB) - always first
2. Custom/user packs (alphabetical)
3. Other bundled packs (alphabetical)

Custom packs show a "Custom" badge in the Sound Packs tab.

---

## UI

### 11. Window

- Title: "KeySound"
- Size: 480 x 640 (resizable)
- Centered on launch
- Close button quits the app
- "Minimize to Tray" button in header hides window to system tray (app keeps running)

### 12. Tabs

- **Sound Packs** tab: browse and select all packs (bundled + custom)
- **Custom Sound** tab: create new packs, edit/delete existing custom packs

### 13. Test Input

- Text input field at top of window
- Typing triggers `play_sound` command for real-time sound preview
- DOM key codes mapped to rdev format (e.g., `Enter` -> `Return`)

### 14. Controls

- Sound toggle button: ON / OFF
- Volume slider: 0-100% with percentage display

---

## System Integration

### 15. System Tray

- Tray icon with menu:
  - **Toggle Sound** - on/off
  - **Settings** - show/focus main window
  - **Quit** - exit app
- Left-click tray icon: show/focus window

### 16. Single Instance

- Only one instance allowed
- Second launch focuses the existing window

### 17. Auto-Start

- Optional auto-start on boot (via `tauri-plugin-autostart`)

---

## Data & Persistence

### 18. Storage

- Active pack ID and volume persisted via `tauri-plugin-store`
- Custom packs stored on disk in `user-soundpacks/` (never overwritten by bundle sync)
- Data versioning via `data-version.json` (v1 baseline, migration framework for future)

### 19. pack.json Format

```json
{
  "id": "pack-id",
  "name": "Display Name",
  "author": "Author",
  "version": "1.0.0",
  "description": "Description",
  "source": "user",
  "defaults": {
    "keydown": "sounds/keydown.wav",
    "volume": 0.8
  },
  "key_overrides": {
    "Space": { "keydown": "sounds/keydown-space.mp3" }
  },
  "category_overrides": {
    "modifiers": {
      "keys": [
        "ShiftLeft",
        "ShiftRight",
        "ControlLeft",
        "ControlRight",
        "Alt",
        "AltGr",
        "MetaLeft",
        "MetaRight"
      ],
      "keydown": "sounds/keydown-modifier.mp3"
    }
  },
  "original_names": {
    "default": "my-click.wav",
    "space": "spacebar.mp3"
  }
}
```

---

## Error Handling

- Pack not found: switch to default
- Sound file missing/corrupt: skip silently, key plays no sound
- Keyboard listener error: logged, app continues
- File import failure: user alert with error message
- Custom pack with empty name: rejected
- Name collision on create: auto-generates unique ID (e.g., `my-pack-2`)
- Mutex lock failure: error string returned to frontend

---

## Security

- No network access (all operations local)
- No telemetry or tracking
- File operations restricted to app data directory and user-selected files
- CSP: null (Tauri default)

---

## Build & Test

- **Build**: `npx tauri build --target x86_64-pc-windows-gnu` (MinGW)
- **Rust tests**: `npm run test:rust` (42 tests, requires MSVC toolchain)
- **E2E tests**: `npm run test:e2e` (59 WebdriverIO tests — real app, no mocks)
- **Lint**: `npm run lint` (ESLint + Clippy)
- **Format**: `npm run format` (oxfmt + cargo fmt)

---

## Constants

| Name                       | Value                          |
| -------------------------- | ------------------------------ |
| Max sound file size        | 5 MB                           |
| Allowed audio formats      | mp3, wav, ogg                  |
| Default volume             | 1.0                            |
| Custom pack default volume | 0.8                            |
| Silence placeholder        | 441 samples @ 44100 Hz (~10ms) |
| Window dimensions          | 480 x 640                      |
| Bundled pack count         | 24                             |
| Custom pack category slots | 5                              |
| Custom pack per-key slots  | unlimited (optional)           |
| Data version               | 1                              |
