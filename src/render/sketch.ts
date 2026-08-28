import p5 from 'p5'
import { Plant, PlantControls, DisplayParams, DEFAULT_CONTROLS } from './plant.js'
import { ParticleSystem } from './particles.js'
import { drawLeaf, pickLeafShape } from './leaves.js'
import { BIAS_MAX } from '../config.js'

let plant: Plant
let particles: ParticleSystem
let controls: PlantControls = { ...DEFAULT_CONTROLS }

const UP = -Math.PI / 2
const DOWN = Math.PI / 2

// Stable pseudo-random from a seed (so leaves/flowers don't flicker frame to frame)
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

export function startSketch(container: HTMLElement) {
  new p5((p: p5) => {
    p.setup = () => {
      const cnv = p.createCanvas(p.windowWidth, p.windowHeight)
      cnv.parent(container)
      p.colorMode(p.HSB, 360, 100, 100, 255)
      plant = new Plant()
      particles = new ParticleSystem()
    }

    p.draw = () => {
      const dt = Math.min(p.deltaTime / 1000, 0.05)

      // Softly persistent dark background for glow trails
      p.push()
      p.blendMode(p.BLEND)
      p.noStroke()
      p.fill(150, 30, 5, 55)
      p.rect(0, 0, p.width, p.height)
      p.pop()

      plant.tick(controls, dt)
      const P = plant.params()

      const t = p.frameCount * 0.012
      const baseLen = p.height * 0.22 * P.species.lenScale
      const originX = p.width / 2
      const originY = p.height * 0.965

      // Grounded base shadow
      p.push()
      p.noStroke()
      p.fill(150, 40, 3, 120)
      p.ellipse(originX, originY + 6, baseLen * 2.4, baseLen * 0.28)
      p.pop()

      p.push()
      drawBranch(p, originX, originY, UP, baseLen, 0, P.growth, P, t, 1)
      p.pop()

      const wind = Math.sin(t * 0.7 * P.species.swaySpeed) * (0.3 + P.sway * 6 * P.species.swayAmount)
      particles.tick(dt, wind)
      particles.draw(p)
    }

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight)
    }
  })
}

export function updateControls(next: PlantControls) {
  controls = next
}

function angLerp(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function drawBranch(
  p: p5,
  x: number,
  y: number,
  angle: number,
  len: number,
  depth: number,
  grow: number,
  P: DisplayParams,
  t: number,
  seed: number,
) {
  if (grow <= 0 || depth > plant.maxDepth) return

  const seg = Math.min(grow, 1)
  const dRatio = depth / plant.maxDepth
  const sp = P.species

  // Organic bow — direction and amount vary per branch; twist gnarls it (bonsai/maple)
  const bowDir = hash(seed * 1.31) < 0.5 ? 1 : -1
  const bend = len * (0.12 + hash(seed) * 0.16) * (0.4 + dRatio) * bowDir *
               (0.6 + 0.4 * Math.sin(t + depth)) * sp.twist
  const ex = x + Math.cos(angle) * len * seg
  const ey = y + Math.sin(angle) * len * seg
  const mx = (x + ex) / 2 + Math.cos(angle + Math.PI / 2) * bend
  const my = (y + ey) / 2 + Math.sin(angle + Math.PI / 2) * bend

  // Woody colour: brown trunk → olive → green twigs
  const woodT = Math.min(dRatio * 1.5, 1)
  const wilt = 1 - P.vitality
  const hue = lerp(26, lerp(112, 40, wilt * 0.5), woodT)
  const sat = lerp(42, 55, woodT)
  const bri = lerp(24 + P.glow * 10, 58, woodT)
  const w = lerp(11, 0.7, dRatio) * sp.thickness

  // Dark edge under-stroke for a solid woody look (inner branches only)
  if (depth <= 3) {
    p.noFill()
    p.stroke(24, 45, 14, 220)
    p.strokeWeight(w * 1.5)
    quad(p, x, y, mx, my, ex, ey)
    // soft glow for the living twigs
    p.push()
    p.blendMode(p.ADD)
    p.stroke(hue, sat, bri, 35 + P.glow * 45)
    p.strokeWeight(w * 2)
    quad(p, x, y, mx, my, ex, ey)
    p.pop()
  }

  p.noFill()
  p.stroke(hue, sat, bri, 220)
  p.strokeWeight(w)
  quad(p, x, y, mx, my, ex, ey)

  if (seg < 1) {
    if (depth >= plant.maxDepth - 2) drawFoliage(p, ex, ey, angle, depth, P, seed, seg)
    return
  }

  // Species droop biases the whole tree (willow droops even while speaking).
  const effBias = Math.max(-1, Math.min(1, P.bias + sp.droop))
  const targetDir = effBias >= 0 ? UP : DOWN
  const biasAmt = Math.min(Math.abs(effBias), 1) * BIAS_MAX * (0.35 + dRatio)
  const sway = (p.noise(depth * 0.4, t * sp.swaySpeed) - 0.5) * P.sway * sp.swayAmount * (0.4 + dRatio) * 2
  const childLen = len * sp.falloff

  const spread = P.spread * sp.spreadMul
  const spreadL = spread * (0.75 + hash(seed * 2.7) * 0.6)
  const spreadR = spread * (0.75 + hash(seed * 3.9) * 0.6)
  const lenL = childLen * (0.82 + hash(seed * 5.1) * 0.36)
  const lenR = childLen * (0.82 + hash(seed * 6.3) * 0.36)
  const jitL = (hash(seed * 7.7) - 0.5) * 0.18 * sp.twist
  const jitR = (hash(seed * 8.9) - 0.5) * 0.18 * sp.twist

  const la = angLerp(angle - spreadL, targetDir, biasAmt) + sway + jitL
  const ra = angLerp(angle + spreadR, targetDir, biasAmt) + sway + jitR
  drawBranch(p, ex, ey, la, lenL, depth + 1, grow - 1, P, t, seed * 2 + 1)
  drawBranch(p, ex, ey, ra, lenR, depth + 1, grow - 1, P, t, seed * 2 + 2)

  if (depth % 2 === 0) {
    const ma = angLerp(angle, targetDir, biasAmt * 0.6) + sway * 0.5 + (hash(seed * 4.2) - 0.5) * 0.12
    drawBranch(p, ex, ey, ma, childLen * (0.85 + hash(seed) * 0.2), depth + 1, grow - 1, P, t, seed * 3 + 7)
  }

  // Dense leaf canopy on the outer two branch levels
  if (depth >= plant.maxDepth - 1) {
    drawFoliage(p, ex, ey, angle, depth, P, seed, 1)
  }

  // Blossoms tucked among the leaves — density + colour come from the species
  // (abundant white/pink for happy sakura, none for sad/angry).
  if (depth >= plant.maxDepth - 2) {
    const bloom = sp.blossomDensity * (0.55 + P.vitality * 0.6)
    if (hash(seed * 1.7) < bloom) {
      drawBlossom(p, ex, ey, P, seed)
    }
  }
}

// A cluster of many small leaves around a branch tip → reads as real foliage
function drawFoliage(
  p: p5,
  x: number,
  y: number,
  angle: number,
  depth: number,
  P: DisplayParams,
  seed: number,
  scale: number,
) {
  const sp = P.species
  const vital = P.vitality
  const wilt = 1 - vital
  const dRatio = depth / plant.maxDepth
  const count = Math.floor((6 + hash(seed * 2.1) * 7) * scale * sp.leafDensity)   // species-scaled
  const clusterR = lerp(30, 15, dRatio) * (0.7 + vital * 0.6) * scale

  for (let i = 0; i < count; i++) {
    const h1 = hash(seed * 13.1 + i * 7.3)
    const h2 = hash(seed * 4.7 + i * 3.1)
    const h3 = hash(seed * 8.3 + i * 5.9)

    // spray leaves around the tip, lifted slightly upward
    const a = angle + (h1 - 0.5) * 2.6
    const dist = h2 * clusterR
    const lx = x + Math.cos(a) * dist
    const ly = y + Math.sin(a) * dist - h3 * clusterR * 0.35

    const leafAng = a + (h3 - 0.5) * 0.9 + wilt * 0.9        // droop when wilting
    const size = lerp(15, 8, dRatio) * (0.6 + h2 * 0.8) * (0.55 + vital * 0.7) * scale * sp.leafSize

    // species palette with per-leaf variation; wilting still nudges toward amber
    const baseHue = (lerp(sp.leafHueA, sp.leafHueB, h1) + 360) % 360
    const hue = lerp(baseHue, 32, wilt * 0.45)
    const sat = sp.leafSat * (0.8 + h2 * 0.35)
    const bri = sp.leafBri * (0.7 + h3 * 0.4) * (0.6 + vital * 0.55)

    const shape = pickLeafShape(sp.shape, hash(seed * 17.3 + i * 2.9))
    drawLeaf(p, lx, ly, leafAng, shape, size, hue, sat, bri)
  }

  if (vital < 0.4 && Math.random() < 0.05 * (0.5 - vital)) particles.spawnPetal(x, y, 38)
  if (vital > 0.72 && Math.random() < 0.02) particles.spawnMote(x, y, P.hue)
}

function drawBlossom(p: p5, x: number, y: number, P: DisplayParams, seed: number) {
  const petals = 5 + Math.floor(hash(seed * 9.1) * 2)
  const r = (5 + P.vitality * 5) * (0.8 + hash(seed * 2.2) * 0.5)
  const rot0 = hash(seed * 3.3) * Math.PI * 2
  const bHue = P.species.blossomHue
  const bSat = P.species.blossomSat

  p.push()
  p.translate(x, y)
  p.rotate(rot0)
  p.noStroke()

  p.push()
  p.blendMode(p.ADD)
  p.fill(bHue, bSat * 0.6, 100, 55)
  p.circle(0, 0, r * 2.2)
  p.pop()

  for (let i = 0; i < petals; i++) {
    p.push()
    p.rotate((i / petals) * Math.PI * 2)
    p.fill(bHue, bSat, 100, 232)
    p.ellipse(0, -r * 0.7, r * 0.6, r * 1.25)
    p.pop()
  }

  // warm golden stamen centre
  p.fill(48, 62, 100, 240)
  p.circle(0, 0, r * 0.55)
  p.pop()
}

function quad(p: p5, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
  p.beginShape()
  p.vertex(x1, y1)
  p.quadraticVertex(cx, cy, x2, y2)
  p.endShape()
}
