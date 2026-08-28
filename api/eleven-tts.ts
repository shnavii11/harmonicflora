// Vercel serverless: proxies a short line to ElevenLabs TTS and streams the audio
// back. ELEVENLABS_API_KEY stays server-side; the browser only ever sends text and
// receives audio bytes (the "proxied results" option in our key-handling pattern).
//
// This is intentionally an occasional milestone whisper, not on the render path —
// it adds a third provider and some latency, a stated tradeoff against the
// latency thesis. On any failure we return 204 so the visuals simply stay silent.

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Fast, low-latency model + a calm default voice (override via env if desired).
const MODEL_ID = 'eleven_flash_v2_5'
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'   // "Rachel"
const MAX_CHARS = 160

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return res.status(204).end()

  const text = String(req.body?.text ?? '').trim().slice(0, MAX_CHARS)
  if (!text) return res.status(204).end()

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`
    const elRes = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        // low, breathy delivery for a whispered feel
        voice_settings: { stability: 0.35, similarity_boost: 0.7, style: 0.2 },
      }),
    })

    if (!elRes.ok) return res.status(204).end()

    const audio = Buffer.from(await elRes.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(audio)
  } catch {
    return res.status(204).end()
  }
}
