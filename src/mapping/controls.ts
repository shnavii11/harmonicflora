// Converts audio features → expressive plant controls (all normalized).

import type { AudioFeatures } from '../audio/features.js'
import type { PitchResult } from '../audio/pitch.js'
import type { PlantControls } from '../render/plant.js'
import { PITCH_MIN_HZ, PITCH_MAX_HZ, PITCH_CLARITY_MIN } from '../config.js'
import { ema } from '../audio/smoothing.js'

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)

let sEnergy = 0
let sPitch = 0.45
let sHue = 135
let sFlux = 0

export function featuresToControls(
  features: AudioFeatures,
  pitch: PitchResult,
  vadActive: boolean,
  _prev: PlantControls,
): PlantControls {
  // Energy: RMS is roughly 0..0.2 for voice → normalize to 0..1
  sEnergy = ema(sEnergy, clamp01(features.rms * 6))

  // Pitch: log-normalize 70–500 Hz → 0..1. Hold previous when unvoiced.
  let hasPitch = false
  if (pitch.clarity >= PITCH_CLARITY_MIN && pitch.hz >= PITCH_MIN_HZ && pitch.hz <= PITCH_MAX_HZ) {
    const t = (Math.log(pitch.hz) - Math.log(PITCH_MIN_HZ)) /
              (Math.log(PITCH_MAX_HZ) - Math.log(PITCH_MIN_HZ))
    sPitch = ema(sPitch, clamp01(t))
    hasPitch = true
  }

  // Timbre → hue: dark/round voice → deep green; bright → gold.
  const centroidT = clamp01((features.spectralCentroid - 200) / 3600)
  sHue = ema(sHue, 140 - centroidT * 78)   // 140 (green) → ~62 (gold)

  // Flux → motion energy (sway)
  sFlux = ema(sFlux, clamp01(features.spectralFlux * 0.5))

  return {
    vadActive,
    energy: sEnergy,
    pitch: sPitch,
    hasPitch,
    hue: sHue,
    flux: sFlux,
  }
}
