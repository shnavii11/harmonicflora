// Browser client for the slow "words path": sends final transcripts to the
// serverless Gemini endpoint and returns emotion weights with timing metadata.
// It never sees the API key, and it degrades to neutral (ok:false) on any error
// so the fast tone-first path always remains the fallback.

import type { EmotionWeights } from './types.js'
import { NEUTRAL_WEIGHTS } from './types.js'

export interface WordsEmotion {
  ok: boolean
  weights: EmotionWeights
  transcript: string
  requestedAt: number   // performance.now() when we sent the text
  resolvedAt: number    // performance.now() when the answer came back
  reason?: string
}

export function createWordsEmotion() {
  let inFlight = false
  let latest: WordsEmotion | null = null

  // Only classify finals, and never more than one request in flight at a time —
  // this path is deliberately slow, so we don't queue it up.
  async function classify(transcript: string): Promise<WordsEmotion | null> {
    const text = transcript.trim()
    if (!text || inFlight) return null
    inFlight = true
    const requestedAt = performance.now()
    try {
      const res = await fetch('/api/gemini-emotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      })
      const data = await res.json() as { ok: boolean; weights: EmotionWeights; reason?: string }
      latest = {
        ok: !!data.ok,
        weights: data.weights ?? { ...NEUTRAL_WEIGHTS },
        transcript: text,
        requestedAt,
        resolvedAt: performance.now(),
        reason: data.reason,
      }
      return latest
    } catch (err) {
      latest = {
        ok: false,
        weights: { ...NEUTRAL_WEIGHTS },
        transcript: text,
        requestedAt,
        resolvedAt: performance.now(),
        reason: String(err),
      }
      return latest
    } finally {
      inFlight = false
    }
  }

  return {
    classify,
    get latest() { return latest },
  }
}
