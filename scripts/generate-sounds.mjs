// Generate WAV sound files for all KeySound packs
// Usage: node scripts/generate-sounds.mjs
// No dependencies needed — raw PCM synthesis + WAV header writing

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = join(__dirname, "..", "src-tauri", "resources", "soundpacks");

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;

// --- WAV encoding ---

function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const numChannels = 1;
  const bytesPerSample = BIT_DEPTH / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 32768 : s * 32767;
    buffer.writeInt16LE(Math.round(val), 44 + i * 2);
  }

  return buffer;
}

function savePack(packId, sounds) {
  const dir = join(PACKS_DIR, packId, "sounds");
  mkdirSync(dir, { recursive: true });
  for (const [name, samples] of Object.entries(sounds)) {
    const wav = encodeWav(samples);
    writeFileSync(join(dir, name), wav);
    console.log(`  ${packId}/sounds/${name} (${wav.length} bytes)`);
  }
}

// --- Synthesis helpers ---

function noise() {
  return Math.random() * 2 - 1;
}

function sine(phase) {
  return Math.sin(2 * Math.PI * phase);
}

function decay(t, rate) {
  return Math.exp(-t * rate);
}

function generate(durationSec, fn) {
  const len = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = fn(t, i);
  }
  return samples;
}

// Simple one-pole low-pass filter
function lowpass(samples, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  const out = new Float64Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = out[i - 1] + alpha * (samples[i] - out[i - 1]);
  }
  return out;
}

// --- Pack: HHKB (default) ---
// Topre electrostatic capacitive switch — soft rubber dome "thock"
// Muted, dampened, no clicky. Smooth and quiet. The sound of money.
// Key character: soft initial contact → cushioned bottom-out → minimal upstroke

function genHHKB() {
  const keydown = generate(0.06, (t) => {
    // Soft rubber dome collapse — no sharp click, just a muted pop
    const dome = noise() * decay(t, 90) * 0.15 * (t < 0.003 ? 1 : 0.3);
    // Deep muted thock — lower freq than Cherry, heavily dampened
    const thock = sine(t * 140) * decay(t, 40) * 0.45;
    // Warm PCB resonance
    const pcb = sine(t * 70) * decay(t, 30) * 0.2;
    return dome + thock + pcb;
  });

  const space = generate(0.1, (t) => {
    // HHKB space is iconic — deep, hollow, longer decay
    const dome = noise() * decay(t, 70) * 0.12 * (t < 0.004 ? 1 : 0.2);
    const thock = sine(t * 95) * decay(t, 20) * 0.5;
    const hollow = sine(t * 50) * decay(t, 15) * 0.3;
    // Stabilizer is dampened on HHKB, barely audible
    const stab = sine(t * 280) * decay(t, 60) * 0.03;
    return dome + thock + hollow + stab;
  });

  const enter = generate(0.07, (t) => {
    // Enter — slightly louder thock, still muted
    const dome = noise() * decay(t, 80) * 0.18 * (t < 0.003 ? 1 : 0.25);
    const thock = sine(t * 130) * decay(t, 35) * 0.45;
    const pcb = sine(t * 65) * decay(t, 25) * 0.2;
    return dome + thock + pcb;
  });

  const modifier = generate(0.04, (t) => {
    // Very soft — HHKB modifiers are extra quiet
    const dome = noise() * decay(t, 120) * 0.1 * (t < 0.003 ? 1 : 0.2);
    const thock = sine(t * 160) * decay(t, 50) * 0.25;
    const pcb = sine(t * 80) * decay(t, 40) * 0.1;
    return dome + thock + pcb;
  });

  const backspace = generate(0.05, (t) => {
    const dome = noise() * decay(t, 100) * 0.13 * (t < 0.003 ? 1 : 0.25);
    const thock = sine(t * 170) * decay(t, 45) * 0.35;
    const pcb = sine(t * 85) * decay(t, 35) * 0.15;
    return dome + thock + pcb;
  });

  return {
    "keydown.wav": Array.from(lowpass(Array.from(keydown), 4000)),
    "keydown-space.wav": Array.from(lowpass(Array.from(space), 3500)),
    "keydown-enter.wav": Array.from(lowpass(Array.from(enter), 4000)),
    "keydown-modifier.wav": Array.from(lowpass(Array.from(modifier), 3800)),
    "keydown-backspace.wav": Array.from(lowpass(Array.from(backspace), 4000)),
  };
}

// --- Pack: Mechanical Keyboard ---
// Blue switch (Razer Green / Cherry MX Blue) — loud, clicky, two-stage
// Acoustic profile: click jacket snap at 1200Hz peak, bottom-out at 300-400Hz
// Total decay ~150ms, two events separated by ~3ms

function genMechanicalKeyboard() {
  const keydown = generate(0.15, (t) => {
    // Click jacket snap — 1200Hz fundamental with 800Hz and 2400Hz harmonics
    const clickTime = t < 0.005; // sharp 5ms transient
    const click1200 = sine(t * 1200) * decay(t, 30) * 0.4 * (clickTime ? 1 : 0.15);
    const click800 = sine(t * 800) * decay(t, 35) * 0.2 * (clickTime ? 1 : 0.1);
    const click2400 = sine(t * 2400) * decay(t, 45) * 0.15 * (clickTime ? 1 : 0.05);
    // Broadband noise burst with the click
    const clickNoise = noise() * 0.5 * (t < 0.003 ? 1 : 0) * decay(t, 150);
    // Bottom-out thud — delayed ~3ms after click, 300-400Hz range
    const bt = Math.max(0, t - 0.003);
    const bottomOut = sine(bt * 350) * decay(bt, 20) * 0.45 * (t > 0.003 ? 1 : 0);
    // Plastic housing resonance
    const housing = noise() * decay(t, 40) * 0.12;
    // Spring ping — subtle high metallic ring
    const spring = sine(t * 3500) * decay(t, 50) * 0.04;
    return clickNoise + click1200 + click800 + click2400 + bottomOut + housing + spring;
  });

  const space = generate(0.2, (t) => {
    // Space bar — same click mechanism but bigger bottom-out + stabilizer
    const clickTime = t < 0.005;
    const click1200 = sine(t * 1200) * decay(t, 28) * 0.35 * (clickTime ? 1 : 0.12);
    const click800 = sine(t * 800) * decay(t, 32) * 0.18 * (clickTime ? 1 : 0.08);
    const click2400 = sine(t * 2400) * decay(t, 40) * 0.12 * (clickTime ? 1 : 0.04);
    const clickNoise = noise() * 0.45 * (t < 0.004 ? 1 : 0) * decay(t, 120);
    // Bigger bottom-out — lower pitch, longer decay
    const bt = Math.max(0, t - 0.003);
    const bottomOut = sine(bt * 250) * decay(bt, 12) * 0.55 * (t > 0.003 ? 1 : 0);
    const housing = noise() * decay(t, 25) * 0.15;
    // Stabilizer wire rattle
    const stab = sine(t * 600) * decay(t, 20) * 0.1;
    const spring = sine(t * 3200) * decay(t, 40) * 0.03;
    return clickNoise + click1200 + click800 + click2400 + bottomOut + housing + stab + spring;
  });

  const enter = generate(0.18, (t) => {
    // Enter — slightly louder click, stabilized key
    const clickTime = t < 0.005;
    const click1200 = sine(t * 1200) * decay(t, 28) * 0.42 * (clickTime ? 1 : 0.15);
    const click800 = sine(t * 800) * decay(t, 32) * 0.2 * (clickTime ? 1 : 0.1);
    const click2400 = sine(t * 2400) * decay(t, 42) * 0.15 * (clickTime ? 1 : 0.05);
    const clickNoise = noise() * 0.55 * (t < 0.003 ? 1 : 0) * decay(t, 140);
    const bt = Math.max(0, t - 0.003);
    const bottomOut = sine(bt * 300) * decay(bt, 16) * 0.5 * (t > 0.003 ? 1 : 0);
    const housing = noise() * decay(t, 30) * 0.14;
    const stab = sine(t * 650) * decay(t, 22) * 0.08;
    return clickNoise + click1200 + click800 + click2400 + bottomOut + housing + stab;
  });

  const modifier = generate(0.12, (t) => {
    // Modifier — lighter press, still clicky
    const clickTime = t < 0.004;
    const click1200 = sine(t * 1200) * decay(t, 35) * 0.3 * (clickTime ? 1 : 0.1);
    const click800 = sine(t * 800) * decay(t, 40) * 0.15 * (clickTime ? 1 : 0.08);
    const clickNoise = noise() * 0.35 * (t < 0.003 ? 1 : 0) * decay(t, 160);
    const bt = Math.max(0, t - 0.003);
    const bottomOut = sine(bt * 380) * decay(bt, 25) * 0.3 * (t > 0.003 ? 1 : 0);
    const housing = noise() * decay(t, 50) * 0.1;
    return clickNoise + click1200 + click800 + bottomOut + housing;
  });

  const backspace = generate(0.14, (t) => {
    // Backspace — normal clicky key
    const clickTime = t < 0.005;
    const click1200 = sine(t * 1200) * decay(t, 30) * 0.38 * (clickTime ? 1 : 0.13);
    const click800 = sine(t * 800) * decay(t, 35) * 0.18 * (clickTime ? 1 : 0.09);
    const click2400 = sine(t * 2400) * decay(t, 45) * 0.12 * (clickTime ? 1 : 0.04);
    const clickNoise = noise() * 0.45 * (t < 0.003 ? 1 : 0) * decay(t, 140);
    const bt = Math.max(0, t - 0.003);
    const bottomOut = sine(bt * 340) * decay(bt, 22) * 0.4 * (t > 0.003 ? 1 : 0);
    const housing = noise() * decay(t, 45) * 0.11;
    return clickNoise + click1200 + click800 + click2400 + bottomOut + housing;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Typewriter ---

function genTypewriter() {
  const keydown = generate(0.08, (t) => {
    const thud = noise() * decay(t, 35) * 0.6;
    const resonance = sine(t * 80) * decay(t, 25) * 0.4;
    return thud + resonance;
  });

  const space = generate(0.12, (t) => {
    const bar = noise() * decay(t, 20) * 0.5;
    const thump = sine(t * 60) * decay(t, 15) * 0.5;
    return bar + thump;
  });

  // Enter = carriage return with bell
  const enter = generate(0.25, (t) => {
    const clunk = noise() * decay(t, 30) * 0.5 * (t < 0.05 ? 1 : 0);
    const bell = sine(t * 2200) * decay(t, 8) * 0.4;
    return clunk + bell;
  });

  const modifier = generate(0.05, (t) => {
    return noise() * decay(t, 60) * 0.3;
  });

  const backspace = generate(0.06, (t) => {
    const click = noise() * decay(t, 50) * 0.4;
    const slide = sine(t * 150) * decay(t, 40) * 0.3;
    return click + slide;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Bubble Pop ---

function genBubble() {
  // Pop = sine sweep from high to low
  const keydown = generate(0.06, (t) => {
    const freq = 800 - t * 8000; // sweep down
    let phase = 0;
    const dt = 1 / SAMPLE_RATE;
    // Recalculate with proper phase integration
    return sine(t * (800 - t * 4000)) * decay(t, 50) * 0.6;
  });

  const space = generate(0.1, (t) => {
    return sine(t * (500 - t * 2500)) * decay(t, 30) * 0.7;
  });

  const enter = generate(0.12, (t) => {
    const pop1 = sine(t * (1000 - t * 5000)) * decay(t, 35) * 0.5;
    const pop2 =
      t > 0.04 ? sine((t - 0.04) * (600 - (t - 0.04) * 3000)) * decay(t - 0.04, 40) * 0.4 : 0;
    return pop1 + pop2;
  });

  const modifier = generate(0.04, (t) => {
    return sine(t * (600 - t * 6000)) * decay(t, 70) * 0.35;
  });

  const backspace = generate(0.05, (t) => {
    // Reverse pop (sweep up)
    return sine(t * (400 + t * 6000)) * decay(t, 55) * 0.5;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Laser / Sci-Fi ---

function genLaser() {
  const keydown = generate(0.07, (t) => {
    const zap = sine(t * (2000 + t * 15000)) * decay(t, 45) * 0.5;
    const hiss = noise() * decay(t, 80) * 0.2;
    return zap + hiss;
  });

  const space = generate(0.12, (t) => {
    const beam = sine(t * (800 + t * 8000)) * decay(t, 25) * 0.6;
    const crackle = noise() * decay(t, 40) * 0.15;
    return beam + crackle;
  });

  const enter = generate(0.15, (t) => {
    // Big zap with reverb-like tail
    const zap = sine(t * (1500 + t * 20000)) * decay(t, 20) * 0.5;
    const rumble = sine(t * 100) * decay(t, 12) * 0.3;
    const spark = noise() * decay(t, 30) * 0.15;
    return zap + rumble + spark;
  });

  const modifier = generate(0.04, (t) => {
    return sine(t * (3000 + t * 10000)) * decay(t, 80) * 0.3;
  });

  const backspace = generate(0.06, (t) => {
    // Reverse zap (sweep down)
    return sine(t * (4000 - t * 30000)) * decay(t, 50) * 0.5;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Minimal Tap ---

function genMinimal() {
  const keydown = lowpass(Array.from(generate(0.02, (t) => noise() * decay(t, 150) * 0.35)), 4000);

  const space = lowpass(Array.from(generate(0.03, (t) => noise() * decay(t, 100) * 0.4)), 3000);

  const enter = lowpass(
    Array.from(
      generate(0.035, (t) => {
        return (noise() * 0.6 + sine(t * 400) * 0.4) * decay(t, 100) * 0.4;
      }),
    ),
    3500,
  );

  const modifier = lowpass(Array.from(generate(0.015, (t) => noise() * decay(t, 200) * 0.2)), 3000);

  const backspace = lowpass(
    Array.from(generate(0.025, (t) => noise() * decay(t, 120) * 0.3)),
    3500,
  );

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Raindrop ---
// Natural rain drop on water/leaf — soft, organic, no metallic ring
// Real raindrop sound = very brief broadband noise impact + muted low resonance
// Should feel like hearing rain on a window or puddle

function genRaindrop() {
  // Water droplet style — pitch rises as ripple spreads, with soft noise impact
  const keydown = generate(0.06, (t) => {
    const freq = 800 + t * 3000;
    return sine(t * freq) * decay(t, 45) * 0.4;
  });

  const space = generate(0.1, (t) => {
    // Bigger drop — lower start pitch, longer decay
    const freq = 500 + t * 2000;
    return sine(t * freq) * decay(t, 25) * 0.5;
  });

  const enter = generate(0.1, (t) => {
    // Double drip
    const drop1 = sine(t * (700 + t * 3000)) * decay(t, 35) * 0.4;
    const drop2 = t > 0.04 ? sine((t - 0.04) * (600 + (t - 0.04) * 2500)) * decay(t - 0.04, 40) * 0.3 : 0;
    return drop1 + drop2;
  });

  const modifier = generate(0.04, (t) => {
    // Small, quick drip
    const freq = 900 + t * 4000;
    return sine(t * freq) * decay(t, 60) * 0.3;
  });

  const backspace = generate(0.06, (t) => {
    // Same water droplet character
    const freq = 800 + t * 3000;
    return sine(t * freq) * decay(t, 45) * 0.4;
  });

  return {
    "keydown.wav": Array.from(lowpass(Array.from(keydown), 5000)),
    "keydown-space.wav": Array.from(lowpass(Array.from(space), 4000)),
    "keydown-enter.wav": Array.from(lowpass(Array.from(enter), 5000)),
    "keydown-modifier.wav": Array.from(lowpass(Array.from(modifier), 5000)),
    "keydown-backspace.wav": Array.from(lowpass(Array.from(backspace), 5000)),
  };
}

// --- Pack: Raindrop on Metal ---
// Rain hitting a tin roof / metal surface — sharp, ringy, resonant
// Real sound: brief noise impact + metallic ring at higher frequency

function genRaindropMetal() {
  const keydown = generate(0.12, (t) => {
    // Sharp impact on metal
    const impact = noise() * decay(t, 100) * 0.4 * (t < 0.004 ? 1 : 0.1);
    // Metallic ring — higher pitched, resonant, longer tail
    const ring = sine(t * 2800) * decay(t, 18) * 0.3;
    // Secondary harmonic
    const ring2 = sine(t * 4200) * decay(t, 25) * 0.12;
    // Tin resonance body
    const body = sine(t * 600) * decay(t, 22) * 0.15;
    return impact + ring + ring2 + body;
  });

  const space = generate(0.18, (t) => {
    // Big drop on a drum-like metal sheet
    const impact = noise() * decay(t, 60) * 0.4 * (t < 0.006 ? 1 : 0.12);
    const ring = sine(t * 1800) * decay(t, 12) * 0.35;
    const ring2 = sine(t * 3000) * decay(t, 18) * 0.15;
    const body = sine(t * 350) * decay(t, 10) * 0.25;
    // Metallic rattle
    const rattle = sine(t * 5500) * decay(t, 30) * 0.06;
    return impact + ring + ring2 + body + rattle;
  });

  const enter = generate(0.22, (t) => {
    // Heavy drop — big resonant ring
    const impact = noise() * decay(t, 50) * 0.45 * (t < 0.008 ? 1 : 0.1);
    const ring = sine(t * 2200) * decay(t, 10) * 0.35;
    const ring2 = sine(t * 3600) * decay(t, 14) * 0.18;
    const ring3 = sine(t * 5000) * decay(t, 20) * 0.08;
    const body = sine(t * 400) * decay(t, 8) * 0.25;
    return impact + ring + ring2 + ring3 + body;
  });

  const modifier = generate(0.08, (t) => {
    // Light tap on metal
    const impact = noise() * decay(t, 120) * 0.25 * (t < 0.003 ? 1 : 0.08);
    const ring = sine(t * 3200) * decay(t, 30) * 0.2;
    const body = sine(t * 800) * decay(t, 35) * 0.1;
    return impact + ring + body;
  });

  const backspace = generate(0.1, (t) => {
    // Scraping / sliding on metal
    const impact = noise() * decay(t, 80) * 0.3 * (t < 0.005 ? 1 : 0.15);
    const ring = sine(t * 2500) * decay(t, 22) * 0.25;
    const ring2 = sine(t * 3800) * decay(t, 28) * 0.1;
    const body = sine(t * 500) * decay(t, 25) * 0.15;
    return impact + ring + ring2 + body;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Cat ---
// Cute cat sounds — meows, purrs, chirps

function genCat() {
  // Short chirp/mew — quick frequency wobble like a cat chirp
  const keydown = generate(0.1, (t) => {
    // Cat chirp = two-tone wobble
    const freq = 700 + Math.sin(t * 40) * 200;
    const voice = sine(t * freq) * 0.4;
    // Breathy noise (cat breath)
    const breath = noise() * 0.05 * decay(t, 20);
    // Envelope: quick attack, medium decay
    const env = Math.min(t * 300, 1) * decay(t, 18);
    return (voice + breath) * env;
  });

  const space = generate(0.2, (t) => {
    // Longer "mew" — pitch slides up then down
    const pitch = 600 + 300 * Math.sin(t * 8) * decay(t, 5);
    const voice = sine(t * pitch) * 0.45;
    const breath = noise() * 0.06 * decay(t, 15);
    const env = Math.min(t * 200, 1) * decay(t, 10);
    return (voice + breath) * env;
  });

  const enter = generate(0.3, (t) => {
    // Full "meow" — two syllables
    const isSecondSyllable = t > 0.12;
    const localT = isSecondSyllable ? t - 0.12 : t;
    const basePitch = isSecondSyllable ? 550 : 700;
    const vibrato = Math.sin(t * 35) * 80;
    const pitch = basePitch + vibrato + (isSecondSyllable ? -localT * 400 : localT * 200);
    const voice = sine(t * pitch) * 0.5;
    // Harmonic richness
    const harm = sine(t * pitch * 2) * 0.12;
    const breath = noise() * 0.07;
    // Envelope with dip between syllables
    let env;
    if (t < 0.1) env = Math.min(t * 150, 1) * decay(t, 8);
    else if (t < 0.14)
      env = 0.15; // brief dip
    else env = 0.8 * decay(t - 0.14, 8);
    return (voice + harm + breath) * env;
  });

  const modifier = generate(0.06, (t) => {
    // Quick purr/trill
    const trill = sine(t * (500 + Math.sin(t * 80) * 150)) * 0.3;
    const env = Math.min(t * 400, 1) * decay(t, 30);
    return trill * env;
  });

  const backspace = generate(0.08, (t) => {
    // Hiss — breathy noise with a bit of tone
    const hiss = noise() * 0.3;
    const tone = sine(t * 900) * 0.1;
    const env = Math.min(t * 300, 1) * decay(t, 25);
    return (hiss + tone) * env;
  });

  return {
    "keydown.wav": Array.from(lowpass(Array.from(keydown), 4000)),
    "keydown-space.wav": Array.from(lowpass(Array.from(space), 3500)),
    "keydown-enter.wav": Array.from(lowpass(Array.from(enter), 3500)),
    "keydown-modifier.wav": Array.from(lowpass(Array.from(modifier), 4000)),
    "keydown-backspace.wav": Array.from(lowpass(Array.from(backspace), 6000)),
  };
}

// --- Main ---

console.log("Generating sound packs...\n");

console.log("[default] HHKB");
savePack("default", genHHKB());

console.log("\n[gaming] Mechanical Keyboard");
savePack("gaming", genMechanicalKeyboard());

console.log("\n[typewriter] Typewriter");
savePack("typewriter", genTypewriter());

console.log("\n[bubble] Bubble Pop");
savePack("bubble", genBubble());

console.log("\n[laser] Laser / Sci-Fi");
savePack("laser", genLaser());

console.log("\n[minimal] Minimal Tap");
savePack("minimal", genMinimal());

console.log("\n[raindrop] Raindrop");
savePack("raindrop", genRaindrop());

console.log("\n[raindrop-metal] Raindrop on Metal");
savePack("raindrop-metal", genRaindropMetal());

console.log("\n[cat] Cat");
savePack("cat", genCat());

console.log("\nDone! All sound packs generated.");
