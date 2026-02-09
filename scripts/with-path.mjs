/**
 * Runs a command with cargo and MinGW on PATH.
 * Usage: node scripts/with-path.mjs <command> [args...]
 */
import { execFileSync } from "child_process";
import { join } from "path";

const home = process.env.USERPROFILE || process.env.HOME;
const cargoBin = join(home, ".cargo", "bin");
const mingwBin = join(
  home,
  "AppData",
  "Local",
  "Microsoft",
  "WinGet",
  "Packages",
  "BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe",
  "mingw64",
  "bin",
);

const [cmd, ...args] = process.argv.slice(2);

try {
  execFileSync(cmd, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: [cargoBin, mingwBin, process.env.PATH].join(process.platform === "win32" ? ";" : ":"),
    },
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
