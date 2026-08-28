import {
  GROWTH_SPEED, VITALITY_RISE, VITALITY_DECAY, LSYSTEM_MAX_DEPTH,
} from '../config.js'

// Expressive, normalized controls coming from the voice.
export interface PlantControls {
  vadActive: boolean
  energy: number     // 0..1 loudness
  pitch: number      // 0..1 log-normalized pitch
  hasPitch: boolean
  hue: number        // 0..360 leaf hue from timbre
  flux: number       // 0..1 motion energy
}

export const DEFAULT_CONTROLS: PlantControls = {
  vadActive: false,
  energy: 0,
  pitch: 0.45,
  hasPitch: false,
  hue: 135,
  flux: 0,
}

// Eased values the renderer reads each frame.
export interface DisplayParams {
  growth: number      // 0..maxDepth — how mature the plant is
  vitality: number    // 0..1 — health/turgor (drives droop, color, petal fall)
  spread: number      // radians between sibling branches
  bias: number        // -1 (droop/wilt) .. +1 (reach up)
  hue: number         // 0..360
  glow: number        // 0..1
  sway: number        // radians of idle/flux sway
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)
const rad = (d: number) => (d * Math.PI) / 180

export class Plant {
  readonly maxDepth = LSYSTEM_MAX_DEPTH
  private growth = 0.5           // start as a small sprout (in depth units)
  private vitality = 0.55
  private eSpread = rad(24)
  private eBias = 0
  private eHue = 135
  private eGlow = 0.35
  private eSway = rad(2)

  reset() {
    this.growth = 0.5
    this.vitality = 0.55
  }

  tick(c: PlantControls, dt: number) {
    // --- Growth: matures while voiced; high pitch grows faster ---
    if (c.vadActive) {
      const drive = c.energy * (0.6 + 0.8 * c.pitch)
      this.growth = clamp(this.growth + drive * GROWTH_SPEED * this.maxDepth * dt, 0.5, this.maxDepth)
    }

    // --- Vitality: rises while speaking with energy, decays in silence ---
    const vTarget = c.vadActive ? clamp(0.4 + c.energy * 0.8, 0, 1) : 0.28
    const vRate = c.vadActive ? VITALITY_RISE : VITALITY_DECAY
    this.vitality += (vTarget - this.vitality) * vRate
    // Low pitch pulls vitality down a touch → low humming feels heavier/wilting
    if (c.hasPitch && c.pitch < 0.35) this.vitality -= (0.35 - c.pitch) * 0.01
    this.vitality = clamp(this.vitality, 0, 1)

    // --- Bias: high pitch + health → reach up; low/silent → droop ---
    const biasTarget = c.hasPitch
      ? clamp((c.pitch - 0.42) * 1.8 + (this.vitality - 0.5), -1, 1)
      : clamp((this.vitality - 0.5) * 1.4, -1, 1)
    this.eBias += (biasTarget - this.eBias) * 0.05

    // --- Spread: higher pitch fans the branches wider ---
    const spreadTarget = rad(18 + (c.hasPitch ? c.pitch : 0.4) * 30)
    this.eSpread += (spreadTarget - this.eSpread) * 0.06

    // --- Colour, glow, sway ---
    this.eHue += (c.hue - this.eHue) * 0.05
    this.eGlow += (clamp(0.22 + c.energy, 0, 1) - this.eGlow) * 0.08
    const swayTarget = rad(1.5 + c.flux * 7 + (c.vadActive ? 0 : 0.5))
    this.eSway += (swayTarget - this.eSway) * 0.05
  }

  params(): DisplayParams {
    return {
      growth: this.growth,
      vitality: this.vitality,
      spread: this.eSpread,
      bias: this.eBias,
      hue: this.eHue,
      glow: this.eGlow,
      sway: this.eSway,
    }
  }
}
