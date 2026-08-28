// Fuses the fast local prosody emotion with the slow words (Gemini) emotion.
//
// The tone path drives instantly every frame; when a words result arrives it
// blends in on top and then decays over a few seconds (words are a sparse,
// occasional correction, not a continuous signal). We also record which path
// last *drove* an emotion change — the fast tone path or the slow words path —
// which is exactly the signal the latency benchmark needs.

import {
  Emotion, EMOTIONS, EmotionWeights, EmotionState, dominantEmotion,
} from './types.js'

export type DrivingPath = 'tone' | 'words'

export interface FusedEmotion extends EmotionState {
  drivenBy: DrivingPath      // which path produced the current dominant emotion
}

// How long a words result keeps influence, and its peak blend weight.
const WORDS_TTL_MS = 6000
const WORDS_MAX_WEIGHT = 0.6

export function createFusion() {
  let wordsWeights: EmotionWeights | null = null
  let wordsAt = 0
  let lastDominant: Emotion = 'neutral'
  let drivenBy: DrivingPath = 'tone'

  function setWords(weights: EmotionWeights, resolvedAt: number) {
    wordsWeights = weights
    wordsAt = resolvedAt
  }

  // Called every frame with the current tone estimate.
  function fuse(tone: EmotionState, now: number): FusedEmotion {
    let weights = tone.weights
    let wordsInfluence = 0

    if (wordsWeights) {
      const age = now - wordsAt
      if (age <= WORDS_TTL_MS) {
        // linear decay of the words influence over its lifetime
        wordsInfluence = WORDS_MAX_WEIGHT * (1 - age / WORDS_TTL_MS)
        weights = blend(tone.weights, wordsWeights, wordsInfluence)
      } else {
        wordsWeights = null
      }
    }

    const dominant = dominantEmotion(weights)
    // Attribute a *change* in dominant emotion to whichever path is currently
    // exerting more pull. If words are meaningfully blended in, credit words.
    if (dominant !== lastDominant) {
      drivenBy = wordsInfluence > 0.25 ? 'words' : 'tone'
      lastDominant = dominant
    }

    return {
      valence: tone.valence,
      arousal: tone.arousal,
      weights,
      dominant,
      drivenBy,
    }
  }

  return { setWords, fuse }
}

function blend(a: EmotionWeights, b: EmotionWeights, t: number): EmotionWeights {
  const out = {} as EmotionWeights
  let sum = 0
  for (const e of EMOTIONS) {
    const v = a[e] * (1 - t) + b[e] * t
    out[e as Emotion] = v
    sum += v
  }
  if (sum > 0) for (const e of EMOTIONS) out[e] /= sum
  return out
}
