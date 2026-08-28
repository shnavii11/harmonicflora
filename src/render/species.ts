// Per-emotion tree "species" as blendable parametric profiles.
//
// The renderer rebuilds the whole tree every frame, so morphing between species
// is just lerping these numbers + cross-fading leaf shape and blossom density.
// This is exactly why the parametric p5 engine was worth keeping over a 3D mesh
// library — every field here is cheap to interpolate per frame.

import type { EmotionWeights } from '../emotion/types.js'
import type { LeafShapeMix } from './leaves.js'

export interface SpeciesProfile {
  // structure
  lenScale: number      // overall canopy size (bonsai short, willow long)
  spreadMul: number     // multiplier on the voice-driven branch spread
  falloff: number       // child length vs parent (higher = taller/fuller)
  twist: number         // gnarl / angular jitter multiplier
  droop: number         // baseline bias added to voice bias: + reaches up, - droops
  thickness: number     // trunk width multiplier
  // motion
  swaySpeed: number     // time multiplier on sway
  swayAmount: number    // sway amplitude multiplier
  // foliage
  leafHueA: number      // hue range lo
  leafHueB: number      // hue range hi
  leafSat: number       // 0..100
  leafBri: number       // 0..100
  leafDensity: number   // multiplier on leaf count
  leafSize: number      // multiplier on leaf size
  shape: LeafShapeMix   // relative weights of {oval, small, maple}
  // blossoms
  blossomDensity: number // 0..1 probability at a blossom site
  blossomHue: number
  blossomSat: number
}

// Neutral/calm — the current green tree (baseline).
const NEUTRAL: SpeciesProfile = {
  lenScale: 1.0, spreadMul: 1.0, falloff: 0.79, twist: 1.0, droop: 0.0, thickness: 1.0,
  swaySpeed: 1.0, swayAmount: 1.0,
  leafHueA: 98, leafHueB: 142, leafSat: 55, leafBri: 58, leafDensity: 1.0, leafSize: 1.0,
  shape: { oval: 1, small: 0, maple: 0 },
  blossomDensity: 0.28, blossomHue: 50, blossomSat: 6,   // occasional pale flowers
}

// Happy — cherry-blossom bonsai: gnarled short trunk, sparse light-green leaves,
// abundant white/pink blossoms.
const HAPPY: SpeciesProfile = {
  lenScale: 0.84, spreadMul: 1.15, falloff: 0.72, twist: 1.7, droop: 0.18, thickness: 1.35,
  swaySpeed: 1.0, swayAmount: 0.9,
  leafHueA: 95, leafHueB: 130, leafSat: 42, leafBri: 74, leafDensity: 0.7, leafSize: 0.9,
  shape: { oval: 1, small: 0, maple: 0 },
  blossomDensity: 0.85, blossomHue: 338, blossomSat: 30,  // white/pink sakura
}

// Sad — drooping willow: long down-swept branches, many small red/maroon leaves,
// no flowers, muted + slow.
const SAD: SpeciesProfile = {
  lenScale: 1.12, spreadMul: 0.75, falloff: 0.86, twist: 0.5, droop: -0.85, thickness: 0.85,
  swaySpeed: 0.55, swayAmount: 0.6,
  // 348..372 (wraps past 360 → red/maroon); renderer applies mod 360.
  leafHueA: 348, leafHueB: 372, leafSat: 48, leafBri: 40, leafDensity: 1.25, leafSize: 0.72,
  shape: { oval: 0, small: 1, maple: 0 },
  blossomDensity: 0.0, blossomHue: 0, blossomSat: 0,
}

// Angry — autumn maple: sharp wide angular branches, three-lobed red/orange leaves,
// fast jagged sway, no soft blossoms.
const ANGRY: SpeciesProfile = {
  lenScale: 1.0, spreadMul: 1.4, falloff: 0.8, twist: 2.2, droop: 0.12, thickness: 1.0,
  swaySpeed: 1.8, swayAmount: 1.7,
  leafHueA: 8, leafHueB: 38, leafSat: 92, leafBri: 70, leafDensity: 0.7, leafSize: 1.5,
  shape: { oval: 0, small: 0, maple: 1 },
  blossomDensity: 0.0, blossomHue: 0, blossomSat: 0,
}

const PROFILES = { happy: HAPPY, sad: SAD, angry: ANGRY, neutral: NEUTRAL } as const

export const BASELINE_SPECIES: SpeciesProfile = { ...NEUTRAL }

// Weighted blend of the four species profiles → one interpolated profile.
export function blendSpecies(w: EmotionWeights): SpeciesProfile {
  const acc = zeroProfile()
  const parts: [number, SpeciesProfile][] = [
    [w.happy, HAPPY], [w.sad, SAD], [w.angry, ANGRY], [w.neutral, NEUTRAL],
  ]
  let total = 0
  for (const [wt, prof] of parts) {
    if (wt <= 0) continue
    total += wt
    addScaled(acc, prof, wt)
  }
  if (total <= 0) return { ...NEUTRAL }
  scale(acc, 1 / total)
  return acc
}

// Lerp one profile toward another in place (used for per-frame morph smoothing).
export function lerpProfile(a: SpeciesProfile, b: SpeciesProfile, t: number) {
  a.lenScale += (b.lenScale - a.lenScale) * t
  a.spreadMul += (b.spreadMul - a.spreadMul) * t
  a.falloff += (b.falloff - a.falloff) * t
  a.twist += (b.twist - a.twist) * t
  a.droop += (b.droop - a.droop) * t
  a.thickness += (b.thickness - a.thickness) * t
  a.swaySpeed += (b.swaySpeed - a.swaySpeed) * t
  a.swayAmount += (b.swayAmount - a.swayAmount) * t
  a.leafHueA += (b.leafHueA - a.leafHueA) * t
  a.leafHueB += (b.leafHueB - a.leafHueB) * t
  a.leafSat += (b.leafSat - a.leafSat) * t
  a.leafBri += (b.leafBri - a.leafBri) * t
  a.leafDensity += (b.leafDensity - a.leafDensity) * t
  a.leafSize += (b.leafSize - a.leafSize) * t
  a.shape.oval += (b.shape.oval - a.shape.oval) * t
  a.shape.small += (b.shape.small - a.shape.small) * t
  a.shape.maple += (b.shape.maple - a.shape.maple) * t
  a.blossomDensity += (b.blossomDensity - a.blossomDensity) * t
  a.blossomHue += (b.blossomHue - a.blossomHue) * t
  a.blossomSat += (b.blossomSat - a.blossomSat) * t
}

export function cloneProfile(p: SpeciesProfile): SpeciesProfile {
  return { ...p, shape: { ...p.shape } }
}

function zeroProfile(): SpeciesProfile {
  return {
    lenScale: 0, spreadMul: 0, falloff: 0, twist: 0, droop: 0, thickness: 0,
    swaySpeed: 0, swayAmount: 0,
    leafHueA: 0, leafHueB: 0, leafSat: 0, leafBri: 0, leafDensity: 0, leafSize: 0,
    shape: { oval: 0, small: 0, maple: 0 },
    blossomDensity: 0, blossomHue: 0, blossomSat: 0,
  }
}

function addScaled(acc: SpeciesProfile, p: SpeciesProfile, k: number) {
  acc.lenScale += p.lenScale * k
  acc.spreadMul += p.spreadMul * k
  acc.falloff += p.falloff * k
  acc.twist += p.twist * k
  acc.droop += p.droop * k
  acc.thickness += p.thickness * k
  acc.swaySpeed += p.swaySpeed * k
  acc.swayAmount += p.swayAmount * k
  acc.leafHueA += p.leafHueA * k
  acc.leafHueB += p.leafHueB * k
  acc.leafSat += p.leafSat * k
  acc.leafBri += p.leafBri * k
  acc.leafDensity += p.leafDensity * k
  acc.leafSize += p.leafSize * k
  acc.shape.oval += p.shape.oval * k
  acc.shape.small += p.shape.small * k
  acc.shape.maple += p.shape.maple * k
  acc.blossomDensity += p.blossomDensity * k
  acc.blossomHue += p.blossomHue * k
  acc.blossomSat += p.blossomSat * k
}

function scale(p: SpeciesProfile, k: number) {
  p.lenScale *= k; p.spreadMul *= k; p.falloff *= k; p.twist *= k; p.droop *= k
  p.thickness *= k; p.swaySpeed *= k; p.swayAmount *= k
  p.leafHueA *= k; p.leafHueB *= k; p.leafSat *= k; p.leafBri *= k
  p.leafDensity *= k; p.leafSize *= k
  p.shape.oval *= k; p.shape.small *= k; p.shape.maple *= k
  p.blossomDensity *= k; p.blossomHue *= k; p.blossomSat *= k
}

export { PROFILES }
