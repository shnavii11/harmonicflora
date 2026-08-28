// L-system grammar for the plant.
// Alphabet:
//   F  — draw forward (branch segment)
//   +  — turn right by angle
//   -  — turn left by angle
//   [  — push state (save position + direction)
//   ]  — pop state (restore position + direction)
//   L  — draw a leaf node
//   X  — growth placeholder (replaced in expansion)

export const AXIOM = 'X'

const RULES: Record<string, string> = {
  // Classic Prusinkiewicz plant — F stays as F so trunk doesn't grow exponentially
  X: 'F[+X][-X]FX',
}

export function expand(sentence: string, iterations: number): string {
  let result = sentence
  for (let i = 0; i < iterations; i++) {
    result = result
      .split('')
      .map(c => RULES[c] ?? c)
      .join('')
  }
  return result
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
  depth: number   // 0 = trunk, higher = tip
  maxDepth: number
  isLeaf: boolean
}

export function buildSegments(
  sentence: string,
  originX: number,
  originY: number,
  segLen: number,
  angleDeg: number,
  maxDepth: number,
): Segment[] {
  const segments: Segment[] = []
  const stack: { x: number; y: number; angle: number; depth: number }[] = []
  let x = originX
  let y = originY
  let angle = -90  // start pointing up
  let depth = 0

  for (const ch of sentence) {
    if (ch === 'F') {
      const rad = (angle * Math.PI) / 180
      // Slight taper: deeper branches are shorter
      const len = segLen * Math.pow(0.86, depth)
      const nx = x + Math.cos(rad) * len
      const ny = y + Math.sin(rad) * len
      segments.push({ x1: x, y1: y, x2: nx, y2: ny, depth, maxDepth, isLeaf: false })
      x = nx
      y = ny
    } else if (ch === '+') {
      angle += angleDeg
    } else if (ch === '-') {
      angle -= angleDeg
    } else if (ch === '[') {
      stack.push({ x, y, angle, depth })
      depth++
    } else if (ch === ']') {
      const top = stack.pop()
      if (top) {
        // Mark the last segment before popping as a leaf tip
        if (segments.length > 0) {
          segments[segments.length - 1].isLeaf = true
        }
        ;({ x, y, angle, depth } = top)
      }
    }
  }

  return segments
}
