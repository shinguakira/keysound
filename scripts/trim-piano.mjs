/**
 * Create piano sound variations from a single MP3 sample.
 * Decodes to PCM, pitch-shifts by resampling, outputs WAV.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import decode from "audio-decode";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIANO_DIR = join(
  __dirname,
  "..",
  "src-tauri",
  "resources",
  "soundpacks",
  "piano",
  "sounds",
);

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;

function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const numChannels = 1;
  const bytesPerSample = BIT_DEPTH / 8;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 32768 : s * 32767;
    buffer.writeInt16LE(Math.round(val), 44 + i * 2);
  }
  return buffer;
}

// Pitch shift by resampling (higher ratio = higher pitch)
function pitchShift(samples, ratio) {
  const newLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const srcIdx = i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, samples.length - 1);
    const frac = srcIdx - idx0;
    out[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac;
  }
  return out;
}

// Fade out the last N ms
function fadeOut(samples, ms) {
  const fadeSamples = Math.floor((SAMPLE_RATE * ms) / 1000);
  const start = Math.max(0, samples.length - fadeSamples);
  for (let i = start; i < samples.length; i++) {
    const t = (i - start) / fadeSamples;
    samples[i] *= 1 - t;
  }
  return samples;
}

async function main() {
  const mp3Buf = readFileSync(join(PIANO_DIR, "keydown-space.mp3"));
  const audioBuffer = await decode(mp3Buf);

  // Get mono channel (use first channel)
  const pcm = audioBuffer.getChannelData(0);
  console.log(
    `Decoded: ${pcm.length} samples, ${audioBuffer.sampleRate}Hz, ${audioBuffer.duration.toFixed(2)}s`,
  );

  // space = original pitch (already the deep note)
  // keydown = slightly higher pitch (ratio > 1 = higher)
  // enter = slightly lower than keydown, fuller
  // modifier = highest pitch, short
  // backspace = between keydown and modifier

  const variants = [
    { name: "keydown.wav", ratio: 1.5, trim: 0.35 },
    { name: "keydown-space.wav", ratio: 1.0, trim: 0.8 },
    { name: "keydown-enter.wav", ratio: 1.2, trim: 0.6 },
    { name: "keydown-modifier.wav", ratio: 2.0, trim: 0.2 },
    { name: "keydown-backspace.wav", ratio: 1.3, trim: 0.3 },
  ];

  for (const v of variants) {
    let shifted = pitchShift(pcm, v.ratio);
    // Trim to duration
    const trimSamples = Math.floor(SAMPLE_RATE * v.trim);
    if (shifted.length > trimSamples) {
      shifted = shifted.slice(0, trimSamples);
    }
    fadeOut(shifted, 30);
    const wav = encodeWav(Array.from(shifted));
    writeFileSync(join(PIANO_DIR, v.name), wav);
    console.log(
      `  ${v.name}: pitch x${v.ratio}, ${v.trim}s, ${wav.length} bytes`,
    );
  }

  // Remove old mp3 files
  for (const f of [
    "keydown.mp3",
    "keydown-space.mp3",
    "keydown-enter.mp3",
    "keydown-modifier.mp3",
    "keydown-backspace.mp3",
  ]) {
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(join(PIANO_DIR, f));
    } catch {}
  }

  console.log("Done!");
}

main().catch(console.error);
