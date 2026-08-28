// The tree talks back at emotional milestones (first bloom, shift to sad…).
//
// Two voices, best-first:
//   1. ElevenLabs via /api/eleven-tts (high quality) — used when the key is set.
//   2. The browser's built-in speechSynthesis — a zero-key, offline fallback so
//      the tree ALWAYS talks back, even under plain `npm run dev`.
//
// Speaking is fire-and-forget (never awaited by the render loop) and throttled so
// it stays occasional — off the visual critical path.

import type { Emotion } from '../emotion/types.js'

// A few lines per emotion; one is picked at random so it doesn't feel canned.
const LINES: Record<Emotion, string[]> = {
  happy: [
    'There it is. You are blooming.',
    'I can feel the sun in your voice.',
    'Look at us, flowering together.',
  ],
  sad: [
    'It is okay to droop for a while.',
    'I will hold still with you.',
    'Even willows grow by the water.',
  ],
  angry: [
    'Let it burn bright, then let it go.',
    'I feel that fire. Breathe with me.',
    'Sharp leaves, strong roots. I have got you.',
  ],
  neutral: [
    'I am here, growing quietly.',
    'Steady breath, steady green.',
  ],
}

// Emotion → speechSynthesis prosody (rate/pitch) for the local fallback voice.
const VOICE: Record<Emotion, { rate: number; pitch: number }> = {
  happy: { rate: 1.08, pitch: 1.3 },
  sad: { rate: 0.82, pitch: 0.8 },
  angry: { rate: 1.15, pitch: 1.0 },
  neutral: { rate: 0.95, pitch: 1.0 },
}

const COOLDOWN_MS = 9000   // minimum gap between whispers

export function createWhisper() {
  let lastAt = -Infinity
  let busy = false
  let audio: HTMLAudioElement | null = null

  async function elevenLabs(text: string): Promise<boolean> {
    try {
      const res = await fetch('/api/eleven-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      // Not-ok / 204 / non-audio (e.g. dev server 404 HTML) → let the caller fall back.
      const type = res.headers.get('content-type') || ''
      if (!res.ok || res.status === 204 || !type.includes('audio')) return false
      const buf = await res.arrayBuffer()
      if (buf.byteLength === 0) return false
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }))
      audio?.pause()
      audio = new Audio(url)
      audio.volume = 0.75
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play().catch(() => URL.revokeObjectURL(url))
      return true
    } catch {
      return false
    }
  }

  function browserSpeak(text: string, emotion: Emotion) {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = VOICE[emotion]
    u.rate = v.rate
    u.pitch = v.pitch
    u.volume = 0.9
    synth.speak(u)
  }

  async function speak(text: string, emotion: Emotion) {
    const now = performance.now()
    if (busy || now - lastAt < COOLDOWN_MS) return
    busy = true
    lastAt = now
    try {
      const spokenByEleven = await elevenLabs(text)
      if (!spokenByEleven) browserSpeak(text, emotion)
    } finally {
      busy = false
    }
  }

  // Fire at a milestone: the dominant emotion just changed into `emotion`.
  function milestone(emotion: Emotion) {
    const pool = LINES[emotion]
    if (!pool || pool.length === 0) return
    const line = pool[Math.floor(Math.random() * pool.length)]
    void speak(line, emotion)   // not awaited: keeps the render loop non-blocking
  }

  return { speak, milestone }
}
