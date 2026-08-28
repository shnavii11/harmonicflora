// Vercel serverless: transcript text → Gemini → emotion weights.
// The GEMINI_API_KEY lives only here; the browser sends text and gets back a
// small JSON object. This is deliberately the *slow* words path we contrast the
// fast local prosody path against — it must degrade gracefully to tone-only on
// timeout or error (we return neutral + ok:false, never a 5xx that breaks the UI).

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Low-latency Flash model. If Google rotates the id, change it here only.
const GEMINI_MODEL = 'gemini-2.0-flash'
const TIMEOUT_MS = 2500

const NEUTRAL = { happy: 0, sad: 0, angry: 0, neutral: 1 }

const PROMPT = (text: string) => `You are an emotion classifier for a single short utterance.
Given the transcript, estimate the speaker's emotion as soft weights that sum to 1
over exactly these keys: happy, sad, angry, neutral.
Judge from word content only. Respond with JSON only, no prose.

Transcript: "${text.replace(/"/g, "'")}"`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(200).json({ ok: false, reason: 'no-key', weights: NEUTRAL })
  }

  const transcript = String((req.body?.transcript ?? '')).trim()
  if (!transcript) {
    return res.status(200).json({ ok: false, reason: 'empty', weights: NEUTRAL })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
    const gRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT(transcript) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              happy: { type: 'number' },
              sad: { type: 'number' },
              angry: { type: 'number' },
              neutral: { type: 'number' },
            },
            required: ['happy', 'sad', 'angry', 'neutral'],
          },
        },
      }),
    })
    clearTimeout(timer)

    if (!gRes.ok) {
      return res.status(200).json({ ok: false, reason: `gemini-${gRes.status}`, weights: NEUTRAL })
    }
    const data = await gRes.json() as any
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
    const parsed = raw ? JSON.parse(raw) : null
    const weights = normalize(parsed)
    return res.status(200).json({ ok: true, weights })
  } catch (err) {
    clearTimeout(timer)
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'error'
    return res.status(200).json({ ok: false, reason, weights: NEUTRAL })
  }
}

function normalize(w: any): typeof NEUTRAL {
  if (!w) return NEUTRAL
  const h = num(w.happy), s = num(w.sad), a = num(w.angry), n = num(w.neutral)
  const sum = h + s + a + n
  if (sum <= 0) return NEUTRAL
  return { happy: h / sum, sad: s / sum, angry: a / sum, neutral: n / sum }
}

function num(x: any): number {
  const v = Number(x)
  return Number.isFinite(v) && v > 0 ? v : 0
}
