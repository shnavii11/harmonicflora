import './styles.css'
import { startSketch, updateControls } from './render/sketch.js'
import { initOverlay } from './ui/overlay.js'
import { initDebugPanel } from './ui/debug.js'
import { openMic } from './audio/mic.js'
import { createFeatureReader } from './audio/features.js'
import { createPitchDetector } from './audio/pitch.js'
import { measureNoiseFloor } from './audio/calibrate.js'
import { VAD } from './audio/vad.js'
import { featuresToControls } from './mapping/controls.js'
import { createProsody } from './emotion/prosody.js'
import { createFusion } from './emotion/fusion.js'
import { createWordsEmotion } from './emotion/words.js'
import { startDeepgramStream } from './stt/deepgram.js'
import { createWhisper } from './tts/eleven.js'
import { dominantEmotion, Emotion } from './emotion/types.js'
import { DEFAULT_CONTROLS, PlantControls } from './render/plant.js'
import { PITCH_MIN_HZ, PITCH_MAX_HZ, PITCH_CLARITY_MIN } from './config.js'
import type { PitchResult } from './audio/pitch.js'

// Raw per-frame log-normalized pitch (0..1) for the prosody window. Mirrors the
// smoothing-free version of the mapping in controls.ts.
function featuresPitchNorm(pitch: PitchResult): { value: number; hasPitch: boolean } {
  if (pitch.clarity >= PITCH_CLARITY_MIN && pitch.hz >= PITCH_MIN_HZ && pitch.hz <= PITCH_MAX_HZ) {
    const t = (Math.log(pitch.hz) - Math.log(PITCH_MIN_HZ)) /
              (Math.log(PITCH_MAX_HZ) - Math.log(PITCH_MIN_HZ))
    return { value: Math.min(Math.max(t, 0), 1), hasPitch: true }
  }
  return { value: 0.45, hasPitch: false }
}

const container = document.getElementById('canvas-container')!
const calibrationMsg = document.getElementById('calibration-msg')!
const legend = document.getElementById('legend')!
const debug = initDebugPanel()

// Start the p5 sketch immediately so the plant draws behind the overlay
startSketch(container)

let controls: PlantControls = { ...DEFAULT_CONTROLS }

initOverlay(async () => {
  try {
    const mic = await openMic()
    await mic.context.resume()  // AudioContext starts suspended until a user gesture

    const reader = createFeatureReader(mic.analyser, mic.context.sampleRate)
    const pitchDetector = createPitchDetector(mic.context.sampleRate, mic.analyser.fftSize)

    // Phase C — calibrate to the room's noise floor before growth begins.
    calibrationMsg.classList.add('visible')
    const noiseFloor = await measureNoiseFloor(() => reader.read().rms, mic.context.sampleRate)
    calibrationMsg.classList.remove('visible')
    legend.classList.add('visible')

    // Real adaptive + hysteresis VAD, seeded with the measured noise floor.
    const vad = new VAD(noiseFloor, mic.context.sampleRate)

    // Prosody-first emotion estimator (local, ~1.5 s rolling window).
    const prosody = createProsody()
    // Slow words path (Deepgram → Gemini) + fusion on top of the tone estimate.
    const words = createWordsEmotion()
    const fusion = createFusion()
    let wordsInfo = 'off'

    // Milestone whispers (ElevenLabs). Fired only when the dominant emotion shifts.
    const whisper = createWhisper()
    let prevDominant: Emotion = 'neutral'

    // Start streaming STT. Optional + non-blocking: if there's no token/key the
    // app keeps running on the fast tone-only path.
    startDeepgramStream(mic.stream, (tr) => {
      if (!tr.isFinal) return
      words.classify(tr.text).then((r) => {
        if (!r) return
        if (r.ok) fusion.setWords(r.weights, r.resolvedAt)
        const ms = Math.round(r.resolvedAt - r.requestedAt)
        wordsInfo = r.ok ? `${dominantEmotion(r.weights)} ${ms}ms` : `${r.reason} ${ms}ms`
      })
    }).catch((err) => {
      console.warn('Words path disabled (tone-only):', err)
      wordsInfo = 'unavailable'
    })

    // Drive the whole pipeline from a render-synced loop.
    const loop = () => {
      const now = performance.now()
      const features = reader.read()
      const pitch = pitchDetector.detect(reader.timeBuf)

      // Phase C: the plant grows only while the VAD says you're truly speaking.
      const speaking = vad.process(features.rms)

      // Tone-first emotion: reacts locally each frame, no network.
      const pitchNorm = featuresPitchNorm(pitch)
      const tone = prosody.update(
        features, pitchNorm.value, pitchNorm.hasPitch, speaking, now,
      )
      // Fuse the slow words correction (if any) on top of the fast tone estimate.
      const emotion = fusion.fuse(tone, now)

      // Emotional milestone → whisper once (off the render path, throttled).
      if (emotion.dominant !== prevDominant) {
        if (speaking) whisper.milestone(emotion.dominant)
        prevDominant = emotion.dominant
      }

      controls = featuresToControls(features, pitch, speaking, controls, emotion)
      updateControls(controls)

      const w = emotion.weights
      debug.update({
        rms: features.rms,
        noiseFloor,
        energy: controls.energy,
        pitchHz: pitch.hz,
        pitchNorm: controls.pitch,
        clarity: pitch.clarity,
        hue: controls.hue,
        flux: controls.flux,
        vad: speaking ? 1 : 0,
        valence: emotion.valence,
        arousal: emotion.arousal,
        emotion: emotion.dominant,
        drivenBy: emotion.drivenBy,
        words: wordsInfo,
        weights: `H${(w.happy * 100).toFixed(0)} S${(w.sad * 100).toFixed(0)} A${(w.angry * 100).toFixed(0)} N${(w.neutral * 100).toFixed(0)}`,
      })

      requestAnimationFrame(loop)
    }
    loop()
  } catch (err) {
    console.error('Microphone error:', err)
    calibrationMsg.classList.remove('visible')
    alert('Could not access the microphone. Please allow mic permission and reload.')
  }
})
