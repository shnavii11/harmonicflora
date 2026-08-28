// Pure VAD logic — no DOM, no Web Audio imports.
// Both the browser app and the Node benchmark import this same file.

import { VAD_ONSET_MARGIN_DB, VAD_OFFSET_MARGIN_DB, VAD_HOLD_MS, FRAME_SIZE } from '../config.js'

function rmsToDb(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-10))
}

export class VAD {
  private noiseFloorDb: number
  private active = false
  private holdFrames: number
  private holdCounter = 0
  private readonly onsetDb: number
  private readonly offsetDb: number

  constructor(noiseFloorRms: number, sampleRate = 44100) {
    this.noiseFloorDb = rmsToDb(noiseFloorRms)
    this.onsetDb = this.noiseFloorDb + VAD_ONSET_MARGIN_DB
    this.offsetDb = this.noiseFloorDb + VAD_OFFSET_MARGIN_DB

    const msPerFrame = (FRAME_SIZE / sampleRate) * 1000
    this.holdFrames = Math.round(VAD_HOLD_MS / msPerFrame)
  }

  updateNoiseFloor(noiseFloorRms: number) {
    this.noiseFloorDb = rmsToDb(noiseFloorRms)
  }

  /** Process one RMS frame. Returns true if VAD is currently active. */
  process(rms: number): boolean {
    const db = rmsToDb(rms)

    if (!this.active) {
      if (db >= this.onsetDb) {
        this.active = true
        this.holdCounter = this.holdFrames
      }
    } else {
      if (db >= this.offsetDb) {
        this.holdCounter = this.holdFrames  // keep alive while above offset
      } else {
        this.holdCounter--
        if (this.holdCounter <= 0) {
          this.active = false
        }
      }
    }

    return this.active
  }

  isActive(): boolean {
    return this.active
  }
}
