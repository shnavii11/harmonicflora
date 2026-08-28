// Helper to inspect a wav clip and assist with labeling speech intervals.
// Usage: npx ts-node benchmark/label.ts benchmark/audio/clip1-pauses.wav

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const wavPath = process.argv[2]
if (!wavPath) {
  console.error('Usage: npx ts-node benchmark/label.ts <path-to.wav>')
  process.exit(1)
}

// Parse a minimal WAV header to get sampleRate and duration
const buf = readFileSync(wavPath)
const sampleRate = buf.readUInt32LE(24)
const byteRate = buf.readUInt32LE(28)
const dataOffset = 44  // standard PCM WAV
const dataSize = buf.readUInt32LE(40)
const durationSec = dataSize / byteRate

console.log(`File:       ${wavPath}`)
console.log(`Sample rate: ${sampleRate} Hz`)
console.log(`Duration:   ${durationSec.toFixed(2)} s`)
console.log()
console.log('Open this file in Audacity (or any audio editor) to find speech intervals.')
console.log('Then edit benchmark/audio/labels.json with the "speech" array, e.g.:')
console.log('  "clip1-pauses.wav": { "speech": [[0.4, 3.1], [4.0, 7.2]] }')
