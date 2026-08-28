// Naive baseline VAD: fixed threshold, no hysteresis, no hold.
// Used only in the benchmark to demonstrate what the naive approach produces.

const FIXED_THRESHOLD_RMS = 0.015

export class BaselineVAD {
  process(rms: number): boolean {
    return rms > FIXED_THRESHOLD_RMS
  }
}
