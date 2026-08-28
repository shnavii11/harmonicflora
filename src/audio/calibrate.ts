// Measures the room noise floor over the calibration window, using the SAME
// RMS definition the live loop uses (so the VAD threshold is meaningful).

import { NOISE_CALIBRATION_MS, FRAME_SIZE } from '../config.js'

export async function measureNoiseFloor(
  readRms: () => number,
  sampleRate: number,
): Promise<number> {
  const msPerFrame = (FRAME_SIZE / sampleRate) * 1000
  const totalFrames = Math.max(1, Math.ceil(NOISE_CALIBRATION_MS / msPerFrame))
  let sumSq = 0

  for (let i = 0; i < totalFrames; i++) {
    await new Promise<void>(r => setTimeout(r, msPerFrame))
    const rms = readRms()
    sumSq += rms * rms
  }

  // Root-mean-square of the per-frame RMS values (energy-consistent average).
  return Math.sqrt(sumSq / totalFrames)
}
