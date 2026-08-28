import p5 from 'p5'
import { Plant, PlantControls, DisplayParams, DEFAULT_CONTROLS } from './plant.js'
import { ParticleSystem } from './particles.js'
import { BRANCH_FALLOFF, BIAS_MAX } from '../config.js'

let plant: Plant
let particles: ParticleSystem
let controls: PlantControls = { ...DEFAULT_CONTROLS }

const UP = -Math.PI / 2
const DOWN = Math.PI / 2

// Stable pseudo-random from an integer seed (so leaves/flowers don't flicker)
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

      // Dark, softly persistent background for glow trails
      p.push()
      p.blendMode(p.BLEND)
      p.noStroke()
      p.fill(150, 30, 5, 55)
      p.rect(0, 0, p.width, p.height)
      p.pop()

      plant.tick(controls, dt)
      const P = plant.params()

      const t = p.frameCount * 0.012
      const baseLen = Math.min(p.width, p.height) * 0.165
      const originX = p.width / 2
      const originY = p.height * 0.94

      p.push()
      drawBranch(p, originX, originY, UP, baseLen, 0, P.growth, P, t, 1)
      p.pop()

      const wind = Math.sin(t * 0.7) * (0.3 + P.sway * 6)
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

  const bend = len * 0.18 * (0.4 + dRatio) * Math.sin(t + depth)
  const ex = x + Math.cos(angle) * len * seg
  const ey = y + Math.sin(angle) * len * seg
  const mx = (x + ex) / 2 + Math.cos(angle + Math.PI / 2) * bend
  const my = (y + ey) / 2 + Math.sin(angle + Math.PI / 2) * bend

  const wilt = 1 - P.vitality
  const hue = lerp(120, lerp(P.hue, 34, wilt * 0.7), dRatio)
  const sat = lerp(45, lerp(70, 28, wilt), dRatio)
  const bri = lerp(48 + P.glow * 18, 82, dRatio)
  const w = lerp(6.5, 0.8, dRatio)

  // Glow underlay + crisp stroke
  p.push()
  p.blendMode(p.ADD)
  p.noFill()
  p.stroke(hue, sat, bri, 55 + P.glow * 60)
  p.strokeWeight(w * 2.4)
  quad(p, x, y, mx, my, ex, ey)
  p.pop()

  p.noFill()
  p.stroke(hue, sat, bri, 210)
  p.strokeWeight(w)
  quad(p, x, y, mx, my, ex, ey)

  if (seg < 1) {
    drawLeaf(p, ex, ey, angle, depth, P, seg, seed)
    return
  }

  const targetDir = P.bias >= 0 ? UP : DOWN
  const biasAmt = Math.min(Math.abs(P.bias), 1) * BIAS_MAX * (0.35 + dRatio)
  const sway = (p.noise(depth * 0.4, t) - 0.5) * P.sway * (0.4 + dRatio) * 2
  const childLen = len * BRANCH_FALLOFF

  const la = angLerp(angle - P.spread, targetDir, biasAmt) + sway
  const ra = angLerp(angle + P.spread, targetDir, biasAmt) + sway
  drawBranch(p, ex, ey, la, childLen, depth + 1, grow - 1, P, t, seed * 2 + 1)
  drawBranch(p, ex, ey, ra, childLen, depth + 1, grow - 1, P, t, seed * 2 + 2)

  if (depth % 2 === 0) {
    const ma = angLerp(angle, targetDir, biasAmt * 0.6) + sway * 0.5
    drawBranch(p, ex, ey, ma, childLen * 0.92, depth + 1, grow - 1, P, t, seed * 3 + 7)
  }

  // Green leaves along the outer two-thirds of the plant (fuller foliage)
  if (depth >= plant.maxDepth - 3) {
    drawLeaf(p, ex, ey, angle, depth, P, 1, seed)
    // a second offset leaf for density
    if (hash(seed * 5.3) < 0.6) {
      drawLeaf(p, ex, ey, angle + (hash(seed) - 0.5) * 1.1, depth, P, 0.85, seed * 7 + 3)
    }
  }

  // White flowers — many, on the outer tips, more when the plant is vital
  if (depth >= plant.maxDepth - 2) {
    if (hash(seed * 1.7) < 0.35 + P.vitality * 0.6) {
      drawBlossom(p, ex, ey, P, seed)
    }
  }
}

function drawLeaf(
  p: p5,
  x: number,
  y: number,
  angle: number,
  depth: number,
  P: DisplayParams,
  seg: number,
  seed: number,
) {
  const dRatio = depth / plant.maxDepth
  const vital = P.vitality
  const size = lerp(22, 9, dRatio) * (0.5 + vital * 0.9) * seg

  // Keep leaves clearly GREEN when healthy; amber only when wilting
  const wilt = 1 - vital
  const greenHue = 108 + (P.hue - 108) * 0.35   // stays in the green band
  const hue = lerp(greenHue, 34, wilt * 0.75)
  const sat = lerp(35, 72, vital)
  const bri = lerp(40, 74, vital)
  const droopTilt = wilt * 0.7

  p.push()
  p.translate(x, y)
  p.rotate(angle + Math.PI / 2 + droopTilt + (hash(seed) - 0.5) * 0.5)
  p.noStroke()

  p.push()
  p.blendMode(p.ADD)
  p.fill(hue, sat, bri, 35 + P.glow * 35)
  leafShape(p, size * 1.15)
  p.pop()

  p.fill(hue, sat, bri, 165)
  leafShape(p, size)
  p.pop()

  if (vital < 0.42 && Math.random() < 0.02 * (0.5 - vital)) {
    particles.spawnPetal(x, y, hue)
  }
  if (vital > 0.7 && Math.random() < 0.008 * vital) {
    particles.spawnMote(x, y, P.hue)
  }
}

function leafShape(p: p5, s: number) {
  p.beginShape()
  p.vertex(0, 0)
  p.bezierVertex(s * 0.55, -s * 0.45, s * 0.55, -s * 1.05, 0, -s * 1.4)
  p.bezierVertex(-s * 0.55, -s * 1.05, -s * 0.55, -s * 0.45, 0, 0)
  p.endShape(p.CLOSE)
}

function drawBlossom(p: p5, x: number, y: number, P: DisplayParams, seed: number) {
  const petals = 5 + Math.floor(hash(seed * 9.1) * 2)   // 5–6
  const r = (4.5 + P.vitality * 5) * (0.8 + hash(seed * 2.2) * 0.5)
  const rot0 = hash(seed * 3.3) * Math.PI * 2

  p.push()
  p.translate(x, y)
  p.rotate(rot0)
  p.noStroke()

  // soft white glow halo
  p.push()
  p.blendMode(p.ADD)
  for (let i = 0; i < petals; i++) {
    p.push()
    p.rotate((i / petals) * Math.PI * 2)
    p.fill(48, 8, 100, 55)
    p.ellipse(0, -r * 0.8, r * 0.9, r * 1.6)
    p.pop()
  }
  p.pop()

  // crisp white petals
  for (let i = 0; i < petals; i++) {
    p.push()
    p.rotate((i / petals) * Math.PI * 2)
    p.fill(50, 6, 100, 225)
    p.ellipse(0, -r * 0.7, r * 0.62, r * 1.25)
    p.pop()
  }

  // glowing warm center
  p.fill(48, 60, 100, 235)
  p.circle(0, 0, r * 0.55)
  p.pop()
}

function quad(p: p5, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
  p.beginShape()
  p.vertex(x1, y1)
  p.quadraticVertex(cx, cy, x2, y2)
  p.endShape()
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
