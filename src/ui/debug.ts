// Hidden debug panel — press D to toggle. Shows live feature values + FPS.
// Wired up fully in Phase B/C when audio features are live.

export function initDebugPanel() {
  let visible = false
  let panel: HTMLDivElement | null = null

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'd') return
    visible = !visible

    if (!panel) {
      panel = document.createElement('div')
      panel.style.cssText = `
        position: fixed; bottom: 16px; left: 16px; z-index: 100;
        background: rgba(0,0,0,0.6); color: #7aad8a;
        font: 11px/1.6 monospace; padding: 10px 14px;
        border: 1px solid rgba(122,173,138,0.2); border-radius: 3px;
        pointer-events: none;
      `
      document.body.appendChild(panel)
    }

    panel.style.display = visible ? 'block' : 'none'
  })

  return {
    update(data: Record<string, string | number>) {
      if (!panel || !visible) return
      panel.innerHTML = Object.entries(data)
        .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(3) : v}`)
        .join('<br>')
    },
  }
}
