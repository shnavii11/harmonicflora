// Emotion model types + the valence/arousal region map.
// Kept tiny and dependency-free so the benchmark can import it too.

export type Emotion = 'happy' | 'sad' | 'angry' | 'neutral'

export const EMOTIONS: Emotion[] = ['happy', 'sad', 'angry', 'neutral']

// Soft weights over the four emotions — always summing to ~1, enabling smooth
// morphs instead of jittery hard switches.
export interface EmotionWeights {
  happy: number
  sad: number
  angry: number
  neutral: number
}

export interface EmotionState {
  valence: number            // 0 (negative) .. 1 (positive)
  arousal: number            // 0 (calm) .. 1 (activated)
  weights: EmotionWeights
  dominant: Emotion
}

// Region centres in normalized valence–arousal space (both 0..1).
// happy = bright + lively, angry = negative + lively, sad = negative + calm,
// neutral = the middle-ground baseline.
export const VA_REGIONS: Record<Emotion, { v: number; a: number }> = {
  happy:   { v: 0.74, a: 0.66 },
  angry:   { v: 0.26, a: 0.74 },
  sad:     { v: 0.30, a: 0.24 },
  neutral: { v: 0.50, a: 0.46 },
}

export const NEUTRAL_WEIGHTS: EmotionWeights = {
  happy: 0, sad: 0, angry: 0, neutral: 1,
}

export const NEUTRAL_STATE: EmotionState = {
  valence: 0.5,
  arousal: 0.45,
  weights: NEUTRAL_WEIGHTS,
  dominant: 'neutral',
}

export function dominantEmotion(w: EmotionWeights): Emotion {
  let best: Emotion = 'neutral'
  let bestVal = -Infinity
  for (const e of EMOTIONS) {
    if (w[e] > bestVal) { bestVal = w[e]; best = e }
  }
  return best
}
