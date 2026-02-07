# KeySound

Keyboard sound effects app. Plays sounds on every keypress, even when the app is not focused.

Built with **Tauri v2 + Rust + SvelteKit + TypeScript**.

## Features

- Global keyboard capture (works system-wide)
- Low-latency audio playback via Kira
- Sound pack system (JSON manifest, per-key or per-category sounds)
- System tray with toggle/settings/quit
- Close window = minimize to tray
- Single instance (second launch focuses existing window)
- Auto-start on boot support

## Prerequisites

### 1. Rust (GNU toolchain)

```bash
# Install Rust
winget install Rustlang.Rustup

# Set GNU toolchain (no Visual Studio needed)
rustup toolchain install stable-x86_64-pc-windows-gnu
rustup default stable-x86_64-pc-windows-gnu
rustup target add x86_64-pc-windows-gnu
```

### 2. MinGW (GCC for Windows)

```bash
winget install BrechtSanders.WinLibs.POSIX.UCRT
```

### 3. Node.js

```bash
# Any version manager works (fnm, nvm, volta)
node -v   # v18+ required
npm -v
```

### 4. Install frontend dependencies

```bash
npm install
```

## PATH Setup

Every terminal session needs MinGW and Cargo in PATH. Run this before any build command:

```bash
export PATH="/c/Users/user2/AppData/Local/Microsoft/WinGet/Packages/BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe/mingw64/bin:$PATH:/c/Users/user2/.cargo/bin"
```

Or add these directories to your system PATH permanently via Windows Settings > Environment Variables.

## Development

```bash
npx tauri dev
```

- Svelte frontend: hot reloads on save
- Rust backend: recompiles on save
- Opens the app window automatically

## Production Build

```bash
rm -rf build .svelte-kit                          # clean (avoids ENOTEMPTY errors)
npx tauri build --target x86_64-pc-windows-gnu    # build + bundle
```

Output:

| File           | Location                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| Portable exe   | `src-tauri/target/x86_64-pc-windows-gnu/release/keysound.exe`                     |
| NSIS installer | `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/KeySound_*-setup.exe` |
| MSI installer  | `src-tauri/target/x86_64-pc-windows-gnu/release/bundle/msi/KeySound_*.msi`        |

## Useful Commands

| Command                                                | What it does                    |
| ------------------------------------------------------ | ------------------------------- |
| `npx tauri dev`                                        | Dev mode with hot reload        |
| `npx tauri build --target x86_64-pc-windows-gnu`       | Production build                |
| `cargo check --target x86_64-pc-windows-gnu`           | Type-check Rust only (fast)     |
| `cargo build --target x86_64-pc-windows-gnu --release` | Compile Rust only (no bundling) |
| `cargo clean`                                          | Delete all build artifacts      |
| `rustc --version`                                      | Check Rust compiler version     |
| `rustup show`                                          | Show active toolchain           |

> First build is slow (~2-5 min) because it compiles all dependencies. After that, incremental builds take ~5-15 seconds.

## Project Structure

```
keysound/
├── src/                          # Svelte frontend
│   ├── app.html
│   └── routes/
│       └── +page.svelte          # Settings UI
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── lib.rs                # Tauri app setup, tray, commands
│   │   ├── keyboard.rs           # Global keyboard listener (rdev)
│   │   ├── sound_engine.rs       # Audio playback (Kira)
│   │   └── sound_pack.rs         # Sound pack loading & key resolution
│   ├── resources/
│   │   └── soundpacks/default/   # Bundled sound pack
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri config
├── package.json                  # Node dependencies
└── README.md
```

## Sound Pack Format

Sound packs live in `soundpacks/` directories with this structure:

```
my-sound-pack/
├── pack.json          # Manifest
└── sounds/
    ├── keydown.wav    # Default key sound
    ├── keydown-space.wav
    └── keydown-enter.wav
```

`pack.json` example:

```json
{
  "id": "my-pack",
  "name": "My Sound Pack",
  "author": "You",
  "version": "1.0.0",
  "description": "Custom keyboard sounds",
  "defaults": {
    "keydown": "sounds/keydown.wav",
    "volume": 0.8
  },
  "key_overrides": {
    "Space": { "keydown": "sounds/keydown-space.wav" },
    "Return": { "keydown": "sounds/keydown-enter.wav" }
  },
  "category_overrides": {}
}
```

Key names use rdev format: `KeyA`, `Space`, `Return`, `ShiftLeft`, `F1`, etc.

## Rust vs Node Cheat Sheet

| Node/TS         | Rust                                   |
| --------------- | -------------------------------------- |
| `node`          | No runtime — compiles to native `.exe` |
| `npm`           | `cargo`                                |
| `package.json`  | `Cargo.toml`                           |
| `node_modules/` | `~/.cargo/registry/` (global cache)    |
| `npm install`   | Automatic on `cargo build`             |
| `tsc --noEmit`  | `cargo check`                          |
| `npm run build` | `cargo build --release`                |

## IDE Setup

[VS Code](https://code.visualstudio.com/) with these extensions:

- [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
