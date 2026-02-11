/**
 * Trim piano samples to ~500ms with a smooth fade-out, output as WAV.
 * Uses audio-decode to read mp3, then writes raw PCM as WAV.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import decode from 'audio-decode';

const INPUT_DIR = join(import.meta.dirname, '..', 'package', 'audio');
const OUTPUT_DIR = join(import.meta.dirname, '..', 'package', 'trimmed');

const TRIM_DURATION = 0.5;   // seconds
const FADE_START = 0.25;     // fade-out starts at this point
const SAMPLE_RATE = 44100;

// Write a WAV file from Float32 mono PCM data
function writeWav(filePath, samples, sampleRate) {
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);       // chunk size
  buffer.writeUInt16LE(1, 20);        // PCM format
  buffer.writeUInt16LE(1, 22);        // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32);  // block align
  buffer.writeUInt16LE(16, 34);       // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    let sample = samples[i];
    // Clamp
    sample = Math.max(-1, Math.min(1, sample));
    const intSample = Math.round(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  writeFileSync(filePath, buffer);
}

// Process all mp3 files
const files = readdirSync(INPUT_DIR).filter(f => f.endsWith('.mp3'));

// Ensure output dir exists
import { mkdirSync } from 'fs';
mkdirSync(OUTPUT_DIR, { recursive: true });

for (const file of files) {
  const inputPath = join(INPUT_DIR, file);
  const mp3Buffer = readFileSync(inputPath);

  const audioBuffer = await decode(mp3Buffer);
  const channelData = audioBuffer.getChannelData(0); // mono or left channel

  const trimSamples = Math.min(
    Math.floor(TRIM_DURATION * audioBuffer.sampleRate),
    channelData.length
  );
  const fadeStartSample = Math.floor(FADE_START * audioBuffer.sampleRate);

  // Create trimmed + faded output
  const output = new Float32Array(trimSamples);
  for (let i = 0; i < trimSamples; i++) {
    let sample = channelData[i];

    // Apply fade-out after FADE_START
    if (i > fadeStartSample) {
      const fadeProgress = (i - fadeStartSample) / (trimSamples - fadeStartSample);
      // Use cosine fade for smooth curve
      const gain = 0.5 * (1 + Math.cos(Math.PI * fadeProgress));
      sample *= gain;
    }

    output[i] = sample;
  }

  const outName = file.replace('.mp3', '.wav');
  writeWav(join(OUTPUT_DIR, outName), output, audioBuffer.sampleRate);

  const origMs = Math.round(channelData.length / audioBuffer.sampleRate * 1000);
  console.log(`  ${file} (${origMs}ms) -> ${outName} (${TRIM_DURATION * 1000}ms)`);
}

console.log(`\nTrimmed ${files.length} files to ${OUTPUT_DIR}`);
