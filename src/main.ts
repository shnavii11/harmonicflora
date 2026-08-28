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
import { DEFAULT_CONTROLS, PlantControls } from './render/plant.js'

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

    // Drive the whole pipeline from a render-synced loop.
    const loop = () => {
      const features = reader.read()
      const pitch = pitchDetector.detect(reader.timeBuf)

      // Phase C: the plant grows only while the VAD says you're truly speaking.
      const speaking = vad.process(features.rms)

      controls = featuresToControls(features, pitch, speaking, controls)
      updateControls(controls)

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
