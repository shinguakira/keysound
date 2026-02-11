/**
 * Create piano-real sound pack from @audio-samples/piano-mp3-velocity8 samples.
 * Maps keyboard keys to piano notes using standard DAW piano keyboard layout.
 *
 * Available samples (Salamander Grand Piano V3, velocity 8):
 *   Every 3 semitones: A, C, D#, F# per octave (A0-C8)
 *   Files: {Note}{Octave}v8.mp3 (e.g., C4v8.mp3, D#3v8.mp3)
 *
 * Each keyboard key maps to its target note, using the nearest available sample.
 * Keys mapping to the same sample share the file (no duplicates).
 *
 * Keyboard mapping (3 octaves: C3-F5):
 *
 * Lower octave C3-B3 (Z-row white, home-row black):
 *   Z=C3, S=C#3, X=D3, D=D#3, C=E3, V=F3, G=F#3, B=G3, H=G#3, N=A3, J=A#3, M=B3
 *
 * Middle octave C4-B4 (Q-row white, number-row black):
 *   Q=C4, 2=C#4, W=D4, 3=D#4, E=E4, R=F4, 5=F#4, T=G4, 6=G#4, Y=A4, 7=A#4, U=B4
 *
 * Upper octave C5-F5:
 *   I=C5, 8=C#5, O=D5, 9=D#5, P=E5, 0=F5
 *
 * Extra: A=B2, F=E3, K=C4, L=D4, ;=E4, /=C3, ,=A2, .=B2
 * Special: Space=C4, Enter=C5, Backspace=C2, Modifiers=C1
 */

import { copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PACK_DIR = join(import.meta.dirname, '..', 'src-tauri', 'resources', 'soundpacks', 'piano-real');
const SOUNDS_DIR = join(PACK_DIR, 'sounds');
const SAMPLES_DIR = join(import.meta.dirname, '..', 'package', 'trimmed');

// Available sample notes (semitone offsets from C in each octave)
// C=0, D#=3, F#=6, A=9
const AVAILABLE_OFFSETS = [0, 3, 6, 9];
const NOTE_NAMES_BY_OFFSET = { 0: 'C', 3: 'D#', 6: 'F#', 9: 'A' };

// All note names to semitone offset from C
const SEMITONE = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

/**
 * Given a target note+octave, find the nearest available sample filename.
 */
function nearestSampleFile(note, octave) {
  const targetSemitone = SEMITONE[note];

  if (octave === 0) {
    return 'A0v8.wav';
  }

  let bestOffset = AVAILABLE_OFFSETS[0];
  let bestDist = 12;
  for (const off of AVAILABLE_OFFSETS) {
    const dist = Math.abs(targetSemitone - off);
    if (dist < bestDist) {
      bestDist = dist;
      bestOffset = off;
    }
  }

  const sampleNote = NOTE_NAMES_BY_OFFSET[bestOffset];
  return `${sampleNote}${octave}v8.wav`;
}

/**
 * Convert a source sample filename to a safe destination filename.
 * e.g., "D#3v8.wav" -> "keydown-dsharp3.wav"
 */
function sampleToDstName(srcFile) {
  // Strip v8.wav suffix, convert # to "sharp", lowercase
  const base = srcFile.replace('v8.wav', '').toLowerCase().replace('#', 'sharp');
  return `keydown-${base}.wav`;
}

// rdev key name -> [note, octave]
const keyMapping = {
  // Extra keys below C3
  'Comma': ['A', 2],
  'Period': ['B', 2],

  // Lower octave C3-B3 (Z-row white keys, home-row black keys)
  'KeyZ': ['C', 3],
  'KeyS': ['C#', 3],
  'KeyX': ['D', 3],
  'KeyD': ['D#', 3],
  'KeyC': ['E', 3],
  'KeyV': ['F', 3],
  'KeyG': ['F#', 3],
  'KeyB': ['G', 3],
  'KeyH': ['G#', 3],
  'KeyN': ['A', 3],
  'KeyJ': ['A#', 3],
  'KeyM': ['B', 3],

  // Middle octave C4-B4 (Q-row white keys, number-row black keys)
  'KeyQ': ['C', 4],       // Middle C
  'Digit2': ['C#', 4],
  'KeyW': ['D', 4],
  'Digit3': ['D#', 4],
  'KeyE': ['E', 4],
  'KeyR': ['F', 4],
  'Digit5': ['F#', 4],
  'KeyT': ['G', 4],
  'Digit6': ['G#', 4],
  'KeyY': ['A', 4],       // A4 = 440Hz
  'Digit7': ['A#', 4],
  'KeyU': ['B', 4],

  // Upper octave C5-F5
  'KeyI': ['C', 5],
  'Digit8': ['C#', 5],
  'KeyO': ['D', 5],
  'Digit9': ['D#', 5],
  'KeyP': ['E', 5],
  'Digit0': ['F', 5],

  // Additional mappings
  'KeyA': ['B', 2],
  'KeyK': ['C', 4],
  'KeyL': ['D', 4],
  'Semicolon': ['E', 4],
  'KeyF': ['E', 3],
  'Slash': ['C', 3],
};

// Collect unique sample files needed, and map each key to its sample's dest name
const samplesToCopy = new Map(); // srcFile -> dstFile
const keyOverrides = {};

for (const [rdevKey, [note, octave]] of Object.entries(keyMapping)) {
  const srcFile = nearestSampleFile(note, octave);

  if (!samplesToCopy.has(srcFile)) {
    samplesToCopy.set(srcFile, sampleToDstName(srcFile));
  }

  const dstFile = samplesToCopy.get(srcFile);
  keyOverrides[rdevKey] = {
    keydown: `sounds/${dstFile}`,
    volume: 1.0,
  };
}

// Copy unique sample files
for (const [src, dst] of samplesToCopy) {
  copyFileSync(join(SAMPLES_DIR, src), join(SOUNDS_DIR, dst));
  console.log(`  ${src} -> ${dst}`);
}

// Special purpose samples (shared files where possible)
const specialSamples = {
  'keydown.wav': 'C4v8.wav',          // Default = middle C
  'keydown-space.wav': 'C4v8.wav',    // Space = middle C
  'keydown-enter.wav': 'C5v8.wav',    // Enter = C5
  'keydown-backspace.wav': 'C2v8.wav', // Backspace = low C
  'keydown-modifier.wav': 'C1v8.wav',  // Modifier = very low C
};

for (const [dst, src] of Object.entries(specialSamples)) {
  copyFileSync(join(SAMPLES_DIR, src), join(SOUNDS_DIR, dst));
  console.log(`  ${src} -> ${dst} (special)`);
}

// Add Space and Enter to key_overrides
keyOverrides['Space'] = { keydown: 'sounds/keydown-space.wav', volume: 1.0 };
keyOverrides['Return'] = { keydown: 'sounds/keydown-enter.wav', volume: 1.0 };

// Build pack.json
const packJson = {
  id: 'piano-real',
  name: 'Piano Real',
  author: 'Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0)',
  version: '1.0.0',
  description: 'Real grand piano — each key mapped to actual piano notes in DAW keyboard layout. 3 octaves (C3-F5).',
  defaults: {
    keydown: 'sounds/keydown.wav',
    volume: 0.8,
  },
  key_overrides: keyOverrides,
  category_overrides: {
    modifiers: {
      keys: [
        'ShiftLeft', 'ShiftRight',
        'ControlLeft', 'ControlRight',
        'Alt', 'AltGr',
        'MetaLeft', 'MetaRight',
      ],
      keydown: 'sounds/keydown-modifier.wav',
      volume: 0.4,
    },
    delete: {
      keys: ['Backspace', 'Delete'],
      keydown: 'sounds/keydown-backspace.wav',
    },
  },
};

writeFileSync(join(PACK_DIR, 'pack.json'), JSON.stringify(packJson, null, 2) + '\n');

const totalFiles = samplesToCopy.size + Object.keys(specialSamples).length;
console.log(`\nCreated piano-real pack with ${Object.keys(keyOverrides).length} key overrides`);
console.log(`Unique sample files: ${samplesToCopy.size}`);
console.log(`Total files in sounds/: ${totalFiles}`);
