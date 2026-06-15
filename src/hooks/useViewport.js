import { useEffect } from 'react'

export function useViewport() {
  useEffect(() => {
    function update() {
      const vv = window.visualViewport
      const h = vv ? vv.height : window.innerHeight
      const off = vv ? vv.offsetTop : 0
      const root = document.documentElement
      root.style.setProperty('--vh', (h * 0.01) + 'px')
      root.style.setProperty('--vv-offset', off + 'px')
      root.style.setProperty('--vv-height', h + 'px')
    }

    update()

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', () => setTimeout(update, 200))

    // Double RAF after load for iOS
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        update()
        window.dispatchEvent(new Event('resize'))
      })
    })

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update)
        window.visualViewport.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
      cancelAnimationFrame(raf)
    }
  }, [])
}
