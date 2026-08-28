// Opens a Deepgram WebSocket with a short-lived token and streams mic audio.
// Wired in Phase E.

export type TranscriptHandler = (transcript: string) => void

export async function startDeepgramStream(
  _stream: MediaStream,
  _onTranscript: TranscriptHandler,
): Promise<() => void> {
  // Phase E implementation
  return () => {}
}
