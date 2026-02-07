// Ensures cargo + MinGW are in PATH, then runs `tauri <args>`
// This way `npm run tauri:dev` works even if your terminal has a stale PATH.

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const CARGO_BIN = join(process.env.USERPROFILE!, ".cargo", "bin");
const MINGW_BIN = join(
  process.env.LOCALAPPDATA!,
  "Microsoft",
  "WinGet",
  "Packages",
  "BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe",
  "mingw64",
  "bin",
);

const pathDirs = process.env.PATH!.split(";");

for (const dir of [CARGO_BIN, MINGW_BIN]) {
  if (existsSync(dir) && !pathDirs.includes(dir)) {
    process.env.PATH = dir + ";" + process.env.PATH;
  }
}

// Run: npx tauri <whatever args were passed>
const args = process.argv.slice(2);
const child = spawn("npx", ["tauri", ...args], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 1));
