import { SMOOTHING_ALPHA } from '../config.js'

export function ema(prev: number, next: number, alpha = SMOOTHING_ALPHA): number {
  return alpha * next + (1 - alpha) * prev
}
