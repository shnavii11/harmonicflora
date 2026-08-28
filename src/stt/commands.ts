// Keyword → visual event mapping. Wired in Phase E.

export type VisualEvent = 'bloom' | 'rain' | 'wither' | 'night' | 'grow' | 'reset'

const KEYWORD_MAP: Record<string, VisualEvent> = {
  bloom: 'bloom',
  rain: 'rain',
  wither: 'wither',
  night: 'night',
  grow: 'grow',
  reset: 'reset',
  new: 'reset',
}

export function parseCommand(transcript: string): VisualEvent | null {
  const words = transcript.toLowerCase().split(/\s+/)
  for (const word of words) {
    if (word in KEYWORD_MAP) return KEYWORD_MAP[word]
  }
  return null
}
