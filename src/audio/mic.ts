// getUserMedia, one AudioContext, taps the stream twice (local analysis + Deepgram).
// Called after the user clicks Enter and grants mic permission.

import { FRAME_SIZE } from '../config.js'

export interface MicHandle {
  context: AudioContext
  stream: MediaStream
  analyser: AnalyserNode
  source: MediaStreamAudioSourceNode
}

export async function openMic(): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = FRAME_SIZE * 2
  source.connect(analyser)
  return { context, stream, analyser, source }
}
