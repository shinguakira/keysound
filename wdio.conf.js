import os from "os";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import HtmlNiceReporter from "wdio-html-nice-reporter";
import { ReportAggregator } from "wdio-html-nice-reporter";
import video from "wdio-video-reporter";

const CARGO_BIN = path.join(os.homedir(), ".cargo", "bin");
const APP_BINARY = path.resolve("./src-tauri/target/x86_64-pc-windows-gnu/debug/keysound.exe");
const REPORT_DIR = "./e2e-report";
const SCREENSHOT_DIR = path.join(REPORT_DIR, "screenshots");
const APP_DATA_DIR = path.join(os.homedir(), "AppData", "Roaming", "com.keysound.desktop");

let tauriDriver;
let exit = false;
let reportAggregator;

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./e2e/**/*.spec.js"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: APP_BINARY,
      },
    },
  ],
  reporters: [
    "spec",
    [
      video,
      {
        saveAllVideos: true,
        videoSlowdownMultiplier: 3,
        videoRenderTimeout: 5000,
        outputDir: SCREENSHOT_DIR,
      },
    ],
    [
      HtmlNiceReporter,
      {
        outputDir: REPORT_DIR,
        filename: "report.html",
        reportTitle: "KeySound E2E Test Report",
        showInBrowser: true,
        collapseTests: false,
        linkScreenshots: true,
        useOnAfterCommandForScreenshot: false,
      },
    ],
  ],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  onPrepare() {
    if (!fs.existsSync(APP_BINARY)) {
      throw new Error(
        `Debug binary not found at ${APP_BINARY}\n` +
          `Build it first with: npx tauri build --debug --no-bundle`,
      );
    }

    // Clean up leftover state from previous runs to ensure deterministic tests
    const userPacks = path.join(APP_DATA_DIR, "user-soundpacks");
    if (fs.existsSync(userPacks)) {
      fs.rmSync(userPacks, { recursive: true, force: true });
      fs.mkdirSync(userPacks, { recursive: true });
    }
    const settings = path.join(APP_DATA_DIR, "settings.json");
    if (fs.existsSync(settings)) {
      fs.unlinkSync(settings);
    }

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    reportAggregator = new ReportAggregator({
      outputDir: REPORT_DIR,
      filename: "report.html",
      reportTitle: "KeySound E2E Test Report",
      showInBrowser: true,
      collapseTests: false,
      linkScreenshots: true,
    });
    reportAggregator.clean();
  },

  // Take a screenshot after every test (pass or fail)
  async afterTest(test, _context, { passed }) {
    const status = passed ? "PASS" : "FAIL";
    const safeName = test.title.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${status}-${safeName}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await browser.saveScreenshot(filepath);
  },

  // Start tauri-driver before test session (with msedgedriver on PATH)
  beforeSession() {
    const driverPath = path.resolve(CARGO_BIN, "tauri-driver.exe");
    tauriDriver = spawn(driverPath, [], {
      stdio: [null, process.stdout, process.stderr],
      env: {
        ...process.env,
        // Ensure msedgedriver.exe (in cargo bin) is on PATH
        PATH: [CARGO_BIN, process.env.PATH].join(";"),
      },
    });

    tauriDriver.on("error", (error) => {
      console.error("tauri-driver error:", error);
      process.exit(1);
    });
    tauriDriver.on("exit", (code) => {
      if (!exit) {
        console.error("tauri-driver exited with code:", code);
        process.exit(1);
      }
    });
  },

  afterSession() {
    closeTauriDriver();
  },

  async onComplete() {
    await reportAggregator.createReport();
  },
};

function closeTauriDriver() {
  exit = true;
  tauriDriver?.kill();
}

function onShutdown(fn) {
  const cleanup = () => {
    try {
      fn();
    } finally {
      process.exit();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
  process.on("SIGBREAK", cleanup);
}

onShutdown(() => {
  closeTauriDriver();
});
