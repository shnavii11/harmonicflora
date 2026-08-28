export function initOverlay(onEnter: () => void) {
  const overlay = document.getElementById('overlay')!
  const btn = document.getElementById('enter-btn')!

  btn.addEventListener('click', () => {
    overlay.classList.add('hidden')
    // After the CSS transition, remove from layout entirely
    overlay.addEventListener('transitionend', () => {
      overlay.style.display = 'none'
    }, { once: true })
    onEnter()
  })
}
