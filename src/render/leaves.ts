// Parametric leaf sprites. Refactored out of sketch.ts so a species profile can
// choose the shape: rounded oval (baseline/happy), small oval (sad willow), and
// a three-lobed maple (angry). During a morph the mix is cross-faded per-leaf via
// a stable hash, so a transition shows some of each shape rather than a hard flip.

import type p5 from 'p5'

export type LeafShape = 'oval' | 'small' | 'maple'

export interface LeafShapeMix {
  oval: number
  small: number
  maple: number
}

// Pick a concrete shape for one leaf from the blended mix, using a stable 0..1
// hash so the same leaf keeps its shape frame-to-frame (no flicker).
export function pickLeafShape(mix: LeafShapeMix, h: number): LeafShape {
  const total = mix.oval + mix.small + mix.maple
  if (total <= 0) return 'oval'
  const r = h * total
  if (r < mix.oval) return 'oval'
  if (r < mix.oval + mix.small) return 'small'
  return 'maple'
}

export function drawLeaf(
  p: p5, x: number, y: number, ang: number, shape: LeafShape,
  s: number, hue: number, sat: number, bri: number,
) {
  p.push()
  p.translate(x, y)
  p.rotate(ang)
  p.noStroke()
  p.fill(hue, sat, bri, 205)

  switch (shape) {
    case 'small':
      // compact narrow leaf — willow
      p.ellipse(0, 0, s * 0.4, s * 0.85)
      vein(p, hue, sat, bri, s * 0.36)
      break
    case 'maple':
      drawMaple(p, s, hue, sat, bri)
      break
    case 'oval':
    default:
      p.ellipse(0, 0, s * 0.6, s)
      vein(p, hue, sat, bri, s * 0.42)
      break
  }
  p.pop()
}

function vein(p: p5, hue: number, sat: number, bri: number, half: number) {
  p.stroke(hue, sat * 0.5, Math.min(bri + 26, 92), 140)
  p.strokeWeight(0.6)
  p.line(0, half, 0, -half)
  p.noStroke()
}

// A stylized 5-lobed maple leaf: outer lobe tips alternating with deep inner
// notches → a clear pointed silhouette. A darker outline + radial veins make the
// lobes read even at small sizes.
function drawMaple(p: p5, s: number, hue: number, sat: number, bri: number) {
  const R = s * 0.72            // lobe-tip radius
  const rIn = s * 0.24          // notch radius between lobes
  // five lobe tips fanned across the top, stem pointing down (+y)
  const tips = [-1.35, -0.66, 0, 0.66, 1.35]

  // dark outline so the star shape stays legible against the canopy
  p.stroke((hue + 350) % 360, Math.min(sat + 10, 100), bri * 0.45, 220)
  p.strokeWeight(Math.max(0.6, s * 0.06))
  p.strokeJoin(p.ROUND)

  p.beginShape()
  p.vertex(0, s * 0.5)                         // stem base at the bottom
  for (let i = 0; i < tips.length; i++) {
    if (i > 0) {
      // notch between this lobe and the previous one
      const na = -Math.PI / 2 + (tips[i] + tips[i - 1]) / 2
      p.vertex(Math.cos(na) * rIn, Math.sin(na) * rIn)
    }
    const a = -Math.PI / 2 + tips[i]
    const reach = i === 2 ? 1.08 : i === 1 || i === 3 ? 1.0 : 0.8
    p.vertex(Math.cos(a) * R * reach, Math.sin(a) * R * reach)   // lobe tip
  }
  p.vertex(0, s * 0.5)
  p.endShape(p.CLOSE)

  // radial veins toward the three main lobes
  p.stroke(hue, sat * 0.5, Math.min(bri + 20, 92), 130)
  p.strokeWeight(0.6)
  for (const tip of [-0.66, 0, 0.66]) {
    const a = -Math.PI / 2 + tip
    p.line(0, s * 0.18, Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7)
  }
  p.noStroke()
}
