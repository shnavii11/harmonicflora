import p5 from 'p5'
import type { Segment } from './lsystem.js'

// Returns the stroke color for a branch segment based on its depth + hue
export function segmentColor(
  p: p5,
  seg: Segment,
  hue: number,
  brightness: number,
): p5.Color {
  const t = seg.depth / Math.max(seg.maxDepth, 1)  // 0 = trunk, 1 = tip
  const h = p.lerp(120, hue, t)                     // trunk is always green
  const s = p.lerp(55, 80, t)
  const b = p.lerp(50 + brightness * 20, 80 + brightness * 15, t)
  const a = p.lerp(220, 160, t)
  // Use numeric args — p5's HSB colorMode(HSB, 360, 100, 100, 255)
  return p.color(h, s, b, a)
}

// Stroke weight tapers from trunk to tip
export function segmentWeight(seg: Segment): number {
  const t = seg.depth / Math.max(seg.maxDepth, 1)
  return lerp(4.5, 0.6, t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
