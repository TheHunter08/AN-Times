import { useEffect } from 'react'

export function useViewport() {
  useEffect(() => {
    const root = document.documentElement

    // Detect iOS PWA standalone mode
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isStandalone = window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    if (isIOS) root.setAttribute('data-ios', 'true')
    if (isStandalone) root.setAttribute('data-pwa', 'true')

    function update() {
      const vv = window.visualViewport
      // In iOS 26 PWA, visualViewport.height reflects the actual visible area
      const h = vv ? vv.height : window.innerHeight
      const off = vv ? vv.offsetTop : 0

      root.style.setProperty('--vh', (h * 0.01) + 'px')
      root.style.setProperty('--vv-offset', off + 'px')
      root.style.setProperty('--vv-height', h + 'px')

      // Expose safe-area values as px for JS consumers
      const safeTop = parseInt(getComputedStyle(root).getPropertyValue('--safe-top')) || 0
      root.style.setProperty('--safe-top-px', safeTop + 'px')
    }

    update()

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', () => setTimeout(update, 300))

    // iOS needs multiple RAF passes after load to get correct dimensions
    const raf1 = requestAnimationFrame(() => {
      update()
      requestAnimationFrame(() => {
        update()
        // One final update after fonts/layout settle
        setTimeout(update, 500)
      })
    })

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update)
        window.visualViewport.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
      cancelAnimationFrame(raf1)
    }
  }, [])
}
