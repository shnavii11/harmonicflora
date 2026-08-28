// Node benchmark: time-to-first-emotional-response, tone-first vs words-only.
//
// This is the headline deliverable of PLAN2: the local prosody path reacts to
// emotional *tone* in ~100 ms, while a text/words pipeline can't say anything
// until speech has been transcribed to a final and an LLM has answered. Here we
// MEASURE the tone-first path by running the real src/emotion/prosody.ts engine
// offline over labelled clips, and MODEL the words-only path from documented STT
// + LLM latency constants (the live app logs real Gemini round-trips you can drop
// straight into WORDS_LLM_MS).
//
// Honest limitation: onsets are hand-marked on a handful of clips, and the
// offline feature extractor approximates the browser AnalyserNode rather than
// reproducing it bit-for-bit — so this is a real, honest delta, not a formal eval.
//
// Usage: npx tsx benchmark/emotion-latency.ts

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PitchDetector } from 'pitchy'
import { createProsody } from '../src/emotion/prosody.js'
import type { AudioFeatures } from '../src/audio/features.js'
import type { Emotion } from '../src/emotion/types.js'
import { FRAME_SIZE, PITCH_MIN_HZ, PITCH_MAX_HZ, PITCH_CLARITY_MIN } from '../src/config.js'

// --- words-path model (documented, replace with live-measured numbers) --------
// Deepgram won't emit a *final* until it endpoints on a pause, and interim words
// arrive after a short buffer; then Gemini has to answer. These are conservative,
// clearly-stated constants — not measurements.
const WORDS_STT_FINALIZE_MS = 900   // typical time until a usable final transcript
const WORDS_LLM_MS = 600            // typical Gemini Flash round-trip (app logs the real value)
const WORDS_MODEL_MS = WORDS_STT_FINALIZE_MS + WORDS_LLM_MS

// A tone-first "response" = the target emotion becomes dominant AND clears this
// confidence floor (robust to the offline feature-scale approximation).
const RESPONSE_WEIGHT = 0.4

interface EmotionLabels {
  [clip: string]: { onsets: { t: number; emotion: Emotion }[] }
}

interface OnsetResult {
  t: number
  emotion: Emotion
  toneMs: number | null   // measured; null = never reached target within clip
  wordsMs: number         // modelled
}

interface ClipResult {
  clip: string
  durationSec: number
  onsets: OnsetResult[]
}

// --- WAV parsing (mirrors benchmark/run.ts; duplicated to avoid its side-effecting main) ---
function parseWav(path: string): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(path)
  const sampleRate = buf.readUInt32LE(24)
  const bitsPerSample = buf.readUInt16LE(34)
  const dataSize = buf.readUInt32LE(40)
  const numSamples = dataSize / (bitsPerSample / 8)
  const samples = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    if (bitsPerSample === 16) samples[i] = buf.readInt16LE(44 + i * 2) / 32768
    else if (bitsPerSample === 32) samples[i] = buf.readFloatLE(44 + i * 4)
  }
  return { samples, sampleRate }
}

// --- minimal iterative radix-2 FFT (FRAME_SIZE = 512 = 2^9) -------------------
function fftMag(frame: Float32Array): Float32Array {
  const n = frame.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  // Hann window to tame spectral leakage
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    re[i] = frame[i] * w
  }
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2
        const tRe = re[b] * curRe - im[b] * curIm
        const tIm = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - tRe; im[b] = im[a] - tIm
        re[a] += tRe; im[a] += tIm
        const nRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nRe
      }
    }
  }
  const half = n >> 1
  const mag = new Float32Array(half)
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i])
  return mag
}

function extractFeatures(frame: Float32Array, sampleRate: number, prevMag: Float32Array): AudioFeatures {
  let sq = 0
  for (let i = 0; i < frame.length; i++) sq += frame[i] * frame[i]
  const rms = Math.sqrt(sq / frame.length)

  const mag = fftMag(frame)
  let num = 0, den = 0, flux = 0
  for (let i = 0; i < mag.length; i++) {
    const freq = (i * sampleRate) / frame.length
    num += freq * mag[i]
    den += mag[i]
    const d = mag[i] - (prevMag[i] || 0)
    if (d > 0) flux += d
    prevMag[i] = mag[i]
  }
  return { rms, spectralCentroid: den > 0 ? num / den : 0, spectralFlux: flux }
}

function pitchNorm(hz: number, clarity: number): { value: number; hasPitch: boolean } {
  if (clarity >= PITCH_CLARITY_MIN && hz >= PITCH_MIN_HZ && hz <= PITCH_MAX_HZ) {
    const t = (Math.log(hz) - Math.log(PITCH_MIN_HZ)) / (Math.log(PITCH_MAX_HZ) - Math.log(PITCH_MIN_HZ))
    return { value: Math.min(Math.max(t, 0), 1), hasPitch: true }
  }
  return { value: 0.45, hasPitch: false }
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function runClip(samples: Float32Array, sampleRate: number, onsets: EmotionLabels[string]['onsets']): OnsetResult[] {
  const msPerFrame = (FRAME_SIZE / sampleRate) * 1000
  const nFrames = Math.floor(samples.length / FRAME_SIZE)
  const prosody = createProsody()
  const detector = PitchDetector.forFloat32Array(FRAME_SIZE)
  const prevMag = new Float32Array(FRAME_SIZE >> 1)
  const frameBuf = new Float32Array(FRAME_SIZE)

  // pending onsets we haven't yet satisfied, in time order
  const pending = onsets.map((o) => ({ ...o, toneMs: null as number | null }))
    .sort((a, b) => a.t - b.t)

  for (let f = 0; f < nFrames; f++) {
    frameBuf.set(samples.subarray(f * FRAME_SIZE, f * FRAME_SIZE + FRAME_SIZE))
    const features = extractFeatures(frameBuf, sampleRate, prevMag)
    const [hz, clarity] = detector.findPitch(frameBuf, sampleRate)
    const pn = pitchNorm(hz, clarity)
    const nowMs = f * msPerFrame
    // VAD proxy offline: treat any voiced/energetic frame as speaking.
    const speaking = pn.hasPitch || features.rms > 0.01
    const state = prosody.update(features, pn.value, pn.hasPitch, speaking, nowMs)

    for (const o of pending) {
      if (o.toneMs !== null) continue
      if (nowMs < o.t * 1000) continue
      if (state.dominant === o.emotion && state.weights[o.emotion] >= RESPONSE_WEIGHT) {
        o.toneMs = nowMs - o.t * 1000
      }
    }
  }

  return pending.map((o) => ({
    t: o.t, emotion: o.emotion, toneMs: o.toneMs, wordsMs: WORDS_MODEL_MS,
  }))
}

const __dirname = dirname(fileURLToPath(import.meta.url))

function main() {
  const labelsPath = join(__dirname, 'audio', 'emotion-labels.json')
  let labels: EmotionLabels
  try {
    labels = JSON.parse(readFileSync(labelsPath, 'utf8'))
  } catch {
    console.error(`No ${labelsPath}. Add clips + onsets there first (see benchmark/audio/README.md).`)
    process.exit(1)
  }

  const artifactsDir = join(__dirname, 'artifacts')
  mkdirSync(artifactsDir, { recursive: true })

  const results: ClipResult[] = []
  for (const [clip, spec] of Object.entries(labels)) {
    if (clip.startsWith('_')) continue
    let wav: ReturnType<typeof parseWav>
    try {
      wav = parseWav(join(__dirname, 'audio', clip))
    } catch {
      console.warn(`Skipping ${clip} (not found)`) ; continue
    }
    const onsets = runClip(wav.samples, wav.sampleRate, spec.onsets)
    results.push({ clip, durationSec: wav.samples.length / wav.sampleRate, onsets })
    console.log(`✓ ${clip} — ${spec.onsets.length} onset(s)`)
  }

  if (results.length === 0) {
    console.error('No labelled clips found. Populate benchmark/audio/emotion-labels.json.')
    process.exit(1)
  }

  const allTone = results.flatMap((r) => r.onsets.map((o) => o.toneMs).filter((x): x is number => x !== null))
  const misses = results.flatMap((r) => r.onsets).filter((o) => o.toneMs === null).length
  const total = results.reduce((s, r) => s + r.onsets.length, 0)
  const medTone = median(allTone)
  const delta = WORDS_MODEL_MS - medTone

  const report = `# HarmonicFlora — Emotion Response Latency (tone-first vs words-only)

Clips: ${results.length}   Onsets: ${total}   Tone-path hits: ${allTone.length}   Missed: ${misses}

|                                   | Tone-first (measured) | Words-only (modelled) |
|-----------------------------------|:---------------------:|:---------------------:|
| Median time-to-first-response ms  | ${medTone.toFixed(0).padStart(21)} | ${WORDS_MODEL_MS.toString().padStart(21)} |

**Headline: the local prosody path responds ~${delta.toFixed(0)} ms sooner than a words-only
pipeline** (${medTone.toFixed(0)} ms vs a modelled ${WORDS_MODEL_MS} ms = ${WORDS_STT_FINALIZE_MS} ms STT-finalize + ${WORDS_LLM_MS} ms LLM).

The words model is a stated estimate, not a per-clip measurement: text pipelines
cannot emit *any* emotion before a transcript final + LLM answer, whereas the tone
path is measured directly here by running the real prosody engine over the audio.

## Per-clip / per-onset
${results.map((r) => `
### ${r.clip} (${r.durationSec.toFixed(1)} s)
| Onset @s | Target | Tone-first ms | Words-only ms |
|---------:|--------|--------------:|--------------:|
${r.onsets.map((o) => `| ${o.t.toFixed(1)} | ${o.emotion} | ${o.toneMs === null ? 'miss' : o.toneMs.toFixed(0)} | ${o.wordsMs} |`).join('\n')}`).join('\n')}

## Honest limitations
- Onsets are hand-marked on a handful of clips — a real delta, not a formal evaluation.
- The offline feature extractor (Hann-windowed radix-2 FFT) approximates the browser
  AnalyserNode; absolute emotion thresholds may differ, so the robust output is the
  *latency to stabilize* on an emotion, not exact per-frame weights.
- The words path is modelled from documented STT + LLM constants; swap in the live
  Gemini latency the app logs for a tighter number.
`

  writeFileSync(join(artifactsDir, 'emotion-report.md'), report)
  writeFileSync(join(artifactsDir, 'emotion-results.json'), JSON.stringify(results, null, 2))

  const rows = ['clip,onset_s,target,tone_first_ms,words_only_ms']
  for (const r of results) {
    for (const o of r.onsets) {
      rows.push([r.clip, o.t.toFixed(1), o.emotion, o.toneMs === null ? '' : o.toneMs.toFixed(0), o.wordsMs].join(','))
    }
  }
  writeFileSync(join(artifactsDir, 'emotion-results.csv'), rows.join('\n'))

  console.log('\n✅ Report written to benchmark/artifacts/emotion-report.md')
  console.log(report)
}

main()
