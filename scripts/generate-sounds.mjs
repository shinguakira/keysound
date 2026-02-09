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

// --- Pack: Silent Keyboard (default) ---
// Soft capacitive switch — muted rubber dome "thock"
// Dampened, no clicky. Smooth and quiet.
// Key character: soft initial contact → cushioned bottom-out → minimal upstroke

function genSilentKeyboard() {
  const keydown = generate(0.06, (t) => {
    // Soft rubber dome collapse — no sharp click, just a muted pop
    const dome = noise() * decay(t, 90) * 0.15 * (t < 0.003 ? 1 : 0.3);
    // Deep muted thock — heavily dampened
    const thock = sine(t * 140) * decay(t, 40) * 0.45;
    // Warm PCB resonance
    const pcb = sine(t * 70) * decay(t, 30) * 0.2;
    return dome + thock + pcb;
  });

  const space = generate(0.1, (t) => {
    // Space — deep, hollow, longer decay
    const dome = noise() * decay(t, 70) * 0.12 * (t < 0.004 ? 1 : 0.2);
    const thock = sine(t * 95) * decay(t, 20) * 0.5;
    const hollow = sine(t * 50) * decay(t, 15) * 0.3;
    // Stabilizer barely audible
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
    // Very soft modifiers
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
  // keydown uses real mp3 sample (タイプライターで文字を打つ1.mp3)

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
    const drop2 =
      t > 0.04 ? sine((t - 0.04) * (600 + (t - 0.04) * 2500)) * decay(t - 0.04, 40) * 0.3 : 0;
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

// --- Pack: Cat --- uses real mp3 samples from C:\Users\user2\Music\SE

// --- Pack: Piano ---
// Grand piano — clean, clear tone with natural decay

function genPiano() {
  // Clean grand piano: pure harmonics with realistic amplitude ratios
  // No noise excitation — just clean tones with soft attack and long decay
  function grandPiano(duration, fundamental, velocity = 1.0) {
    return generate(duration, (t) => {
      // Soft attack envelope — not instant, mimics hammer travel
      const attack = 1 - Math.exp(-t * 80);

      // Grand piano harmonic amplitudes (measured from real recordings)
      // Higher partials decay faster, lower partials sustain
      const partials = [
        { n: 1, amp: 1.0, decayRate: 3 },
        { n: 2, amp: 0.6, decayRate: 4 },
        { n: 3, amp: 0.3, decayRate: 5 },
        { n: 4, amp: 0.15, decayRate: 7 },
        { n: 5, amp: 0.08, decayRate: 9 },
        { n: 6, amp: 0.04, decayRate: 12 },
      ];

      let tone = 0;
      for (const p of partials) {
        const freq = fundamental * p.n;
        // Skip partials above Nyquist
        if (freq > SAMPLE_RATE / 2) break;
        tone += sine(t * freq) * p.amp * decay(t, p.decayRate);
      }

      // Subtle body thump on attack — very short, clean low sine
      const body = sine(t * fundamental * 0.5) * decay(t, 25) * 0.15;

      return (tone * attack + body) * velocity * 0.45;
    });
  }

  // C4 (262Hz) — mid-range, clear and pleasant for regular keys
  const keydown = grandPiano(0.3, 262, 0.9);

  // C3 (131Hz) — lower, fuller for space
  const space = grandPiano(0.45, 131, 1.0);

  // C4+E4 chord — bright major third for enter
  const enterDur = 0.5;
  const enterC4 = grandPiano(enterDur, 262, 0.8);
  const enterE4 = grandPiano(enterDur, 330, 0.7);
  const enterLen = Math.floor(SAMPLE_RATE * enterDur);
  const enter = new Float64Array(enterLen);
  for (let i = 0; i < enterLen; i++) {
    enter[i] = enterC4[i] * 0.55 + enterE4[i] * 0.45;
  }

  // E4 (330Hz) — light, quick for modifiers
  const modifier = grandPiano(0.15, 330, 0.6);

  // A3 (220Hz) — mid for backspace
  const backspace = grandPiano(0.2, 220, 0.7);

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Harp ---
// Harp string pluck — bright attack, shimmering harmonics, gentle decay

function genHarp() {
  const keydown = generate(0.2, (t) => {
    // String pluck attack
    const pluck = noise() * decay(t, 300) * 0.15 * (t < 0.002 ? 1 : 0);
    // Fundamental D5 ~587Hz — harp is bright
    const f1 = sine(t * 587) * decay(t, 8) * 0.5;
    const f2 = sine(t * 1174) * decay(t, 12) * 0.2;
    const f3 = sine(t * 1761) * decay(t, 16) * 0.08;
    // Slight shimmer — detuned harmonic
    const shimmer = sine(t * 590) * decay(t, 9) * 0.1;
    return pluck + f1 + f2 + f3 + shimmer;
  });

  const space = generate(0.35, (t) => {
    // Low glissando feel — sweep through a few notes
    const base = 262 + Math.sin(t * 4) * 40;
    const f1 = sine(t * base) * decay(t, 4) * 0.5;
    const f2 = sine(t * base * 2) * decay(t, 6) * 0.2;
    const shimmer = sine(t * (base + 3)) * decay(t, 5) * 0.15;
    return f1 + f2 + shimmer;
  });

  const enter = generate(0.3, (t) => {
    // Arpeggio — three notes in quick succession
    const n1 = sine(t * 523) * decay(t, 5) * 0.4;
    const n2 = t > 0.06 ? sine((t - 0.06) * 659) * decay(t - 0.06, 5) * 0.35 : 0;
    const n3 = t > 0.12 ? sine((t - 0.12) * 784) * decay(t - 0.12, 6) * 0.3 : 0;
    return n1 + n2 + n3;
  });

  const modifier = generate(0.12, (t) => {
    // Light high pluck
    const f1 = sine(t * 880) * decay(t, 14) * 0.35;
    const f2 = sine(t * 1760) * decay(t, 18) * 0.1;
    return f1 + f2;
  });

  const backspace = generate(0.15, (t) => {
    // Muted string — damped quickly
    const f1 = sine(t * 494) * decay(t, 20) * 0.4;
    const f2 = sine(t * 988) * decay(t, 25) * 0.12;
    return f1 + f2;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Gunshot --- uses real mp3 samples from C:\Users\user2\Music\SE
// --- Pack: Katana Slash --- uses real mp3 samples from C:\Users\user2\Music\SE

// --- Pack: Drum ---
// Drum kit — snare, kick, hi-hat, toms

function genDrum() {
  const keydown = generate(0.1, (t) => {
    // Snare — noise burst + low body
    const snap = noise() * decay(t, 30) * 0.5 * (t < 0.005 ? 1 : 0.6);
    const body = sine(t * 200) * decay(t, 25) * 0.4;
    // Snare wire buzz
    const wire = noise() * decay(t, 18) * 0.15;
    return snap + body + wire;
  });

  const space = generate(0.15, (t) => {
    // Kick drum — deep thump
    const attack = noise() * decay(t, 120) * 0.3 * (t < 0.004 ? 1 : 0.1);
    // Pitch drops rapidly (beater impact)
    const freq = 120 * Math.exp(-t * 30) + 50;
    const body = sine(t * freq) * decay(t, 10) * 0.7;
    return attack + body;
  });

  const enter = generate(0.15, (t) => {
    // Crash cymbal
    const attack = noise() * (t < 0.005 ? 0.7 : 0.4) * decay(t, 6);
    const shimmer = sine(t * 4000) * decay(t, 10) * 0.15;
    const shimmer2 = sine(t * 5500) * decay(t, 12) * 0.08;
    const body = sine(t * 300) * decay(t, 8) * 0.2;
    return attack + shimmer + shimmer2 + body;
  });

  const modifier = generate(0.04, (t) => {
    // Hi-hat (closed) — short, crisp
    const hit = noise() * decay(t, 80) * 0.4;
    const ring = sine(t * 6000) * decay(t, 100) * 0.1;
    return hit + ring;
  });

  const backspace = generate(0.08, (t) => {
    // Rim shot — sharp crack
    const crack = noise() * decay(t, 60) * 0.5 * (t < 0.003 ? 1 : 0.3);
    const ring = sine(t * 800) * decay(t, 30) * 0.3;
    return crack + ring;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(lowpass(Array.from(space), 3000)),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Fist Blow --- uses real mp3 samples from C:\Users\user2\Music\SE

// --- Pack: Violin ---
// Bowed string — warm, expressive, with vibrato

function genViolin() {
  const keydown = generate(0.15, (t) => {
    // Bow attack — slight scratch
    const bow = noise() * decay(t, 80) * 0.12 * (t < 0.01 ? 1 : 0.2);
    // A4 440Hz with vibrato
    const vibrato = Math.sin(t * 35) * 8;
    const f1 = sine(t * (440 + vibrato)) * 0.45;
    const f2 = sine(t * (880 + vibrato * 2)) * 0.15;
    const f3 = sine(t * (1320 + vibrato * 3)) * 0.06;
    // Envelope: smooth attack and release
    const env = Math.min(t * 80, 1) * decay(t, 10);
    return bow + (f1 + f2 + f3) * env;
  });

  const space = generate(0.3, (t) => {
    // Low sustained note — G3 196Hz, richer
    const bow = noise() * decay(t, 60) * 0.1 * (t < 0.015 ? 1 : 0.15);
    const vibrato = Math.sin(t * 30) * 5;
    const f1 = sine(t * (196 + vibrato)) * 0.5;
    const f2 = sine(t * (392 + vibrato * 2)) * 0.2;
    const f3 = sine(t * (588 + vibrato * 3)) * 0.1;
    const f4 = sine(t * (784 + vibrato * 4)) * 0.05;
    const env = Math.min(t * 50, 1) * decay(t, 5);
    return bow + (f1 + f2 + f3 + f4) * env;
  });

  const enter = generate(0.25, (t) => {
    // Double stop — two notes (A4 + E5)
    const bow = noise() * decay(t, 70) * 0.15 * (t < 0.012 ? 1 : 0.2);
    const vibrato = Math.sin(t * 32) * 6;
    const a4 = sine(t * (440 + vibrato)) * 0.35;
    const e5 = sine(t * (659 + vibrato * 1.5)) * 0.3;
    const a4h = sine(t * (880 + vibrato * 2)) * 0.1;
    const env = Math.min(t * 60, 1) * decay(t, 6);
    return bow + (a4 + e5 + a4h) * env;
  });

  const modifier = generate(0.08, (t) => {
    // Pizzicato — plucked string
    const pluck = noise() * decay(t, 200) * 0.15 * (t < 0.002 ? 1 : 0);
    const f1 = sine(t * 660) * decay(t, 18) * 0.45;
    const f2 = sine(t * 1320) * decay(t, 22) * 0.12;
    return pluck + f1 + f2;
  });

  const backspace = generate(0.1, (t) => {
    // Short detached note
    const bow = noise() * decay(t, 100) * 0.1 * (t < 0.008 ? 1 : 0.15);
    const vibrato = Math.sin(t * 40) * 5;
    const f1 = sine(t * (523 + vibrato)) * 0.4;
    const f2 = sine(t * (1046 + vibrato * 2)) * 0.12;
    const env = Math.min(t * 100, 1) * decay(t, 16);
    return bow + (f1 + f2) * env;
  });

  return {
    "keydown.wav": Array.from(keydown),
    "keydown-space.wav": Array.from(space),
    "keydown-enter.wav": Array.from(enter),
    "keydown-modifier.wav": Array.from(modifier),
    "keydown-backspace.wav": Array.from(backspace),
  };
}

// --- Pack: Taiko --- uses real mp3 samples from C:\Users\user2\Music\SE
// --- Pack: Mokugyo --- uses real mp3 samples from C:\Users\user2\Music\SE

// --- Main ---

console.log("Generating sound packs...\n");

console.log("[default] Silent Keyboard");
savePack("default", genSilentKeyboard());

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

// cat — uses real mp3 samples, skip synthesis

console.log("\n[piano] Piano");
savePack("piano", genPiano());

console.log("\n[harp] Harp");
savePack("harp", genHarp());

// gunshot — uses real mp3 samples, skip synthesis
// katana  — uses real mp3 samples, skip synthesis

console.log("\n[drum] Drum Kit");
savePack("drum", genDrum());

// fist — uses real mp3 samples, skip synthesis

console.log("\n[violin] Violin");
savePack("violin", genViolin());

// taiko   — uses real mp3 samples, skip synthesis
// mokugyo — uses real mp3 samples, skip synthesis

console.log("\nDone! All sound packs generated.");
