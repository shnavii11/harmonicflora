// Streaming STT over Deepgram, authorized by a short-lived token minted by
// api/deepgram-token.ts (the real key never reaches the browser). Emits partial
// and final transcripts, each stamped with performance.now() at receive time so
// the fusion/measurement layer can reason about the words-path latency.

export interface Transcript {
  text: string
  isFinal: boolean
  receivedAt: number   // performance.now() when we got it (for latency math)
  speechStart: number  // Deepgram's word start time (seconds into the stream)
}

export type TranscriptHandler = (t: Transcript) => void

const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-2&smart_format=true&interim_results=true&punctuate=true&encoding=opus'

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/deepgram-token', { method: 'POST' })
  if (!res.ok) throw new Error(`deepgram-token failed: ${res.status}`)
  const { token } = await res.json() as { token?: string }
  if (!token) throw new Error('deepgram-token returned no token')
  return token
}

export async function startDeepgramStream(
  stream: MediaStream,
  onTranscript: TranscriptHandler,
): Promise<() => void> {
  const token = await fetchToken()

  // Deepgram accepts subprotocol auth: ['token', <key>]. Browsers can't set an
  // Authorization header on a WebSocket, so this is the supported path.
  const ws = new WebSocket(DEEPGRAM_URL, ['token', token])

  let recorder: MediaRecorder | null = null
  let keepAlive: ReturnType<typeof setInterval> | null = null
  let stopped = false

  ws.onopen = () => {
    if (stopped) return
    // webm/opus containerized chunks — matches encoding=opus above.
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    recorder = new MediaRecorder(stream, { mimeType: mime })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
    }
    recorder.start(250)   // emit a chunk 4x/second

    // keep the socket warm during silence
    keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, 8000)
  }

  ws.onmessage = (evt) => {
    let msg: any
    try { msg = JSON.parse(evt.data) } catch { return }
    if (msg.type !== 'Results') return
    const alt = msg.channel?.alternatives?.[0]
    const text: string = alt?.transcript ?? ''
    if (!text) return
    onTranscript({
      text,
      isFinal: !!msg.is_final,
      receivedAt: performance.now(),
      speechStart: msg.start ?? 0,
    })
  }

  ws.onerror = (e) => console.error('Deepgram WS error', e)

  const stop = () => {
    stopped = true
    if (keepAlive) clearInterval(keepAlive)
    try { recorder?.stop() } catch { /* already stopped */ }
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })) } catch { /* ignore */ }
      ws.close()
    }
  }

  return stop
}
