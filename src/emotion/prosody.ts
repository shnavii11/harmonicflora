// Local, fast prosodic-emotion estimator (the core of the MVP).
//
// It keeps a short rolling window (~1.5 s) of normalized prosodic features and
// reduces them to a valence/arousal point, then to soft weights over
// {happy, sad, angry, neutral} by Gaussian distance to each region. Soft weights
// (not a hard label) are what let the tree morph smoothly between species.
//
// Honest limitation: emotion from a handful of prosodic features is approximate
// and single-speaker-tuned. We mitigate with soft blending + smoothing, and
// (Phase 2) a words path can confirm/correct a beat later.

import type { AudioFeatures } from '../audio/features.js'
import {
  Emotion, EMOTIONS, EmotionWeights, EmotionState,
  VA_REGIONS, NEUTRAL_STATE, dominantEmotion,
} from './types.js'
import { EMOTION_WINDOW_MS, EMOTION_REGION_SIGMA, EMOTION_SMOOTH_ALPHA } from '../config.js'
import { ema } from '../audio/smoothing.js'

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)

interface Sample {
  t: number
  energy: number      // 0..1
  centroid: number    // 0..1 brightness
  flux: number        // 0..1
  pitch: number       // 0..1 (only meaningful when voiced)
  voiced: boolean
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function variance(xs: number[], m: number): number {
  if (xs.length < 2) return 0
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return s / xs.length
}

export function createProsody() {
  const window: Sample[] = []
  let prevVad = false
  let onsets: number[] = []       // timestamps of VAD rising edges

  // smoothed emotion weights (EMA'd for stable morphs)
  const w: EmotionWeights = { ...NEUTRAL_STATE.weights }
  let sValence = NEUTRAL_STATE.valence
  let sArousal = NEUTRAL_STATE.arousal

  function update(
    features: AudioFeatures,
    pitchNorm: number,
    hasPitch: boolean,
    vadActive: boolean,
    nowMs: number,
  ): EmotionState {
    // --- normalize the raw features the same way controls.ts does ---
    const energy = clamp01(features.rms * 11)
    const centroid = clamp01((features.spectralCentroid - 200) / 3600)
    const flux = clamp01(features.spectralFlux * 0.5)

    window.push({ t: nowMs, energy, centroid, flux, pitch: pitchNorm, voiced: hasPitch })

    // VAD rising edge → speaking onset (proxy for speaking rate)
    if (vadActive && !prevVad) onsets.push(nowMs)
    prevVad = vadActive

    // drop anything older than the window
    const cutoff = nowMs - EMOTION_WINDOW_MS
    while (window.length && window[0].t < cutoff) window.shift()
    onsets = onsets.filter((t) => t >= cutoff)

    // --- rolling statistics ---
    const voicedSamples = window.filter((s) => s.voiced)
    const energyArr = window.map((s) => s.energy)
    const centroidArr = window.map((s) => s.centroid)
    const fluxArr = window.map((s) => s.flux)
    const pitchArr = voicedSamples.map((s) => s.pitch)

    const energyMean = mean(energyArr)
    const energyVar = variance(energyArr, energyMean)
    const centroidMean = mean(centroidArr)
    const fluxMean = mean(fluxArr)
    const pitchMean = pitchArr.length ? mean(pitchArr) : 0.45
    const pitchVar = variance(pitchArr, pitchMean)

    const windowSec = EMOTION_WINDOW_MS / 1000
    const rateN = clamp01(onsets.length / (windowSec * 3))   // ~3 onsets/window → 1

    // derived expressive scalars
    const pitchDyn = clamp01(pitchVar * 8)      // intonation dynamism
    const flat = 1 - pitchDyn                    // monotone-ness
    const harsh = clamp01(centroidMean * fluxMean * 4)  // rough high-freq energy

    // Is anyone actually speaking right now? (window has recent voiced/energetic frames)
    const active = voicedSamples.length > 0 || energyMean > 0.06

    // --- valence: positive = bright, high & varied pitch; negative = harsh, loud + flat ---
    // Gains are deliberately strong so ordinary humming actually spans 0..1 and
    // reaches the region centres (otherwise everything collapses to neutral).
    let valence = 0.5
      + 0.80 * (centroidMean - 0.38)    // brightness
      + 0.70 * (pitchMean - 0.42)       // pitch height
      + 0.65 * pitchDyn                  // lively intonation → positive
      - 0.85 * harsh                     // roughness → negative
      - 0.95 * (energyMean * flat)       // loud + monotone → angry/negative
    valence = clamp01(valence)

    // --- arousal: loud / fast / dynamic ---
    let arousal = 0.05
      + 1.35 * energyMean
      + 0.35 * fluxMean
      + 0.45 * pitchDyn
      + 0.30 * rateN
      + 0.35 * clamp01(energyVar * 12)
    arousal = clamp01(arousal)

    // In silence, relax toward the neutral baseline instead of drifting to "sad".
    if (!active) {
      valence = 0.5
      arousal = NEUTRAL_STATE.arousal
    }

    sValence = ema(sValence, valence, 0.20)
    sArousal = ema(sArousal, arousal, 0.20)

    // --- (valence, arousal) → soft weights by Gaussian distance to each region ---
    const target = regionWeights(sValence, sArousal, active)
    for (const e of EMOTIONS) w[e] = ema(w[e], target[e], EMOTION_SMOOTH_ALPHA)
    normalize(w)

    return {
      valence: sValence,
      arousal: sArousal,
      weights: { ...w },
      dominant: dominantEmotion(w),
    }
  }

  return { update }
}

function regionWeights(v: number, a: number, active: boolean): EmotionWeights {
  const sig2 = EMOTION_REGION_SIGMA * EMOTION_REGION_SIGMA
  const out = {} as EmotionWeights
  let sum = 0
  for (const e of EMOTIONS) {
    const r = VA_REGIONS[e]
    const d2 = (v - r.v) * (v - r.v) + (a - r.a) * (a - r.a)
    const wt = Math.exp(-d2 / (2 * sig2))
    out[e as Emotion] = wt
    sum += wt
  }
  for (const e of EMOTIONS) out[e] /= sum || 1
  // Bias toward neutral when nobody is speaking, so the tree rests as baseline green.
  if (!active) {
    for (const e of EMOTIONS) out[e] = e === 'neutral' ? 0.7 + 0.3 * out[e] : 0.3 * out[e]
    normalize(out)
  }
  return out
}

function normalize(w: EmotionWeights) {
  const sum = w.happy + w.sad + w.angry + w.neutral
  if (sum <= 0) { w.neutral = 1; return }
  w.happy /= sum; w.sad /= sum; w.angry /= sum; w.neutral /= sum
}
