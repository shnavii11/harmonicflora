import type p5 from 'p5'
import { MAX_PARTICLES } from '../config.js'

interface Petal {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  size: number
  hue: number
  life: number    // 1 → 0
  kind: 'petal' | 'mote'
}

export class ParticleSystem {
  private particles: Petal[] = []

  spawnPetal(x: number, y: number, hue: number) {
    if (this.particles.length >= MAX_PARTICLES) return
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.2 + Math.random() * 0.4,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.08,
      size: 4 + Math.random() * 5,
      hue,
      life: 1,
      kind: 'petal',
    })
  }

  spawnMote(x: number, y: number, hue: number) {
    if (this.particles.length >= MAX_PARTICLES) return
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.35,   // rises
      rot: 0,
      vrot: 0,
      size: 1.5 + Math.random() * 2,
      hue,
      life: 1,
      kind: 'mote',
    })
  }

  tick(dt: number, windX: number) {
    const step = dt * 60   // normalize to ~per-frame at 60fps
    for (const p of this.particles) {
      if (p.kind === 'petal') {
        p.vy += 0.012 * step               // gravity
        p.vx += windX * 0.02 * step
        p.rot += p.vrot * step
        p.life -= 0.006 * step
      } else {
        p.vx += (Math.random() - 0.5) * 0.04 * step
        p.life -= 0.012 * step
      }
      p.x += p.vx * step
      p.y += p.vy * step
    }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  draw(p: p5) {
    p.push()
    p.blendMode(p.ADD)
    p.noStroke()
    for (const pt of this.particles) {
      if (pt.kind === 'mote') {
        p.fill(pt.hue, 45, 95, pt.life * 120)
        p.circle(pt.x, pt.y, pt.size * (1 + (1 - pt.life)))
      } else {
        p.push()
        p.translate(pt.x, pt.y)
        p.rotate(pt.rot)
        p.fill(pt.hue, 55, 80, pt.life * 150)
        p.ellipse(0, 0, pt.size * 0.6, pt.size)
        p.pop()
      }
    }
    p.pop()
  }

  count() {
    return this.particles.length
  }
}
