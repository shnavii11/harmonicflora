// Reads RMS, spectral centroid, and spectral flux directly from an AnalyserNode.
// We deliberately avoid Meyda's ScriptProcessor (it frequently never fires) and
// pull from the AnalyserNode in a requestAnimationFrame loop instead — reliable.

export interface AudioFeatures {
  rms: number
  spectralCentroid: number   // Hz
  spectralFlux: number
}

export const SILENT_FEATURES: AudioFeatures = {
  rms: 0,
  spectralCentroid: 0,
  spectralFlux: 0,
}

export function createFeatureReader(analyser: AnalyserNode, sampleRate: number) {
  const fftSize = analyser.fftSize
  const binCount = analyser.frequencyBinCount
  const timeBuf = new Float32Array(fftSize)
  const freqBuf = new Float32Array(binCount)      // dB values
  const prevMag = new Float32Array(binCount)

  function read(): AudioFeatures {
    analyser.getFloatTimeDomainData(timeBuf)
    analyser.getFloatFrequencyData(freqBuf)

    // RMS from the time-domain waveform
    let sq = 0
    for (let i = 0; i < fftSize; i++) sq += timeBuf[i] * timeBuf[i]
    const rms = Math.sqrt(sq / fftSize)

    // Spectral centroid + spectral flux from the magnitude spectrum
    let num = 0
    let den = 0
    let flux = 0
    for (let i = 0; i < binCount; i++) {
      const mag = Math.pow(10, freqBuf[i] / 20)   // dB → linear magnitude
      const freq = (i * sampleRate) / fftSize
      num += freq * mag
      den += mag
      const d = mag - prevMag[i]
      if (d > 0) flux += d                          // half-wave rectified flux
      prevMag[i] = mag
    }
    const spectralCentroid = den > 0 ? num / den : 0

    return { rms, spectralCentroid, spectralFlux: flux }
  }

  return { read, timeBuf }
}
