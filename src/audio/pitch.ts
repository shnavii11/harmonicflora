// Pitchy wrapper: returns fundamental frequency + clarity.
import { PitchDetector } from 'pitchy'

export interface PitchResult {
  hz: number
  clarity: number   // 0–1
}

export const SILENT_PITCH: PitchResult = { hz: 0, clarity: 0 }

export function createPitchDetector(sampleRate: number, inputLength: number) {
  const detector = PitchDetector.forFloat32Array(inputLength)
  return {
    detect(buffer: Float32Array): PitchResult {
      const [hz, clarity] = detector.findPitch(buffer, sampleRate)
      return { hz, clarity }
    },
  }
}
