// Vercel serverless function: mints a 30-second Deepgram temporary token.
// The real API key never reaches the browser.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DEEPGRAM_TOKEN_TTL_S } from '../src/config.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPGRAM_API_KEY not configured' })
  }

  try {
    const dgRes = await fetch('https://api.deepgram.com/v1/auth/token', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: DEEPGRAM_TOKEN_TTL_S }),
    })

    if (!dgRes.ok) {
      const text = await dgRes.text()
      return res.status(502).json({ error: 'Deepgram error', detail: text })
    }

    const data = await dgRes.json() as { key?: string }
    return res.status(200).json({ token: data.key })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
