import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Sidebar } from '../components/Sidebar.js'
import type { SidebarItem } from '../components/Sidebar.js'
import { Header } from '../components/Header.js'
import { IconMenu } from '../components/Icons.js'
import { colors } from '../design-system/colors'
import { shouldIgnoreAppGesture } from '../../utils/gesture.js'

export interface AppShellProps {
  navItems: SidebarItem[]
  activeNav: string
  onSelectNav: (id: string) => void
  sidebarHeader?: ReactNode
  sidebarFooter?: ReactNode
  pageTitle: ReactNode
  breadcrumb?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
}

const DRAWER_W = 240
const MOBILE_QUERY = '(max-width: 1023px)'

export function AppShell({
  navItems,
  activeNav,
  onSelectNav,
  sidebarHeader,
  sidebarFooter,
  pageTitle,
  breadcrumb,
  headerActions,
  children,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  ))
  const [dragX, setDragX] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const gestureStartedAt = useRef(0)
  const draggingRef = useRef(false)
  const axisLockedRef = useRef<'h' | 'v' | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
    setDragX(null)
  }, [activeNav])

  useEffect(() => {
    if (isMobile) return
    setMobileNavOpen(false)
    setDragX(null)
  }, [isMobile])

  useEffect(() => {
    if (!mobileNavOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileNavOpen(false)
        setDragX(null)
        window.requestAnimationFrame(() => menuButtonRef.current?.focus())
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter(element => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!isMobile) return

    const onStart = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (shouldIgnoreAppGesture(event.target, document.body)) return
      if (!mobileNavOpen && event.clientX > 24) return
      pointerIdRef.current = event.pointerId
      touchStartX.current = event.clientX
      touchStartY.current = event.clientY
      gestureStartedAt.current = performance.now()
      axisLockedRef.current = null
      draggingRef.current = false
    }

    const onMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId || touchStartX.current === null || touchStartY.current === null) return
      const startX = touchStartX.current
      const dx = event.clientX - startX
      const dy = event.clientY - touchStartY.current

      if (!axisLockedRef.current) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        axisLockedRef.current = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'h' : 'v'
      }
      if (axisLockedRef.current !== 'h') return

      if (!mobileNavOpen) {
        if (dx < 0) return
        draggingRef.current = true
        event.preventDefault()
        setDragX(Math.min(Math.max(-DRAWER_W + dx, -DRAWER_W), 0))
      } else {
        draggingRef.current = true
        event.preventDefault()
        setDragX(Math.min(Math.max(dx, -DRAWER_W), 0))
      }
    }

    const onEnd = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId || touchStartX.current === null) return
      const dx = event.clientX - touchStartX.current
      const velocity = Math.abs(dx) / Math.max(1, performance.now() - gestureStartedAt.current)

      if (!mobileNavOpen) {
        setMobileNavOpen(Boolean(draggingRef.current && (dx > DRAWER_W * .3 || (dx > 34 && velocity > .48))))
      } else if (draggingRef.current) {
        setMobileNavOpen(!(dx < -DRAWER_W * .3 || (dx < -34 && velocity > .48)))
      }

      setDragX(null)
      draggingRef.current = false
      axisLockedRef.current = null
      touchStartX.current = null
      touchStartY.current = null
      pointerIdRef.current = null
    }

    document.addEventListener('pointerdown', onStart, { passive: true })
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onEnd, { passive: true })
    document.addEventListener('pointercancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onStart)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
    }
  }, [isMobile, mobileNavOpen])

  const drawerX = dragX !== null ? dragX : (mobileNavOpen ? 0 : -DRAWER_W)
  const drawerProgress = Math.max(0, Math.min(1, (drawerX + DRAWER_W) / DRAWER_W))
  const isDragging = dragX !== null
  const drawerTransition = isDragging ? 'none' : 'transform 280ms cubic-bezier(.2,.8,.2,1)'
  const shellVariables = { '--uiv2-drawer-width': `${DRAWER_W}px` } as CSSProperties

  const closeDrawer = (restoreFocus = false) => {
    setMobileNavOpen(false)
    setDragX(null)
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  return (
    <div className="uiv2-app-shell" style={shellVariables}>
      {!isMobile && (
        <Sidebar
          items={navItems}
          active={activeNav}
          onSelect={onSelectNav}
          header={sidebarHeader}
          footer={sidebarFooter}
        />
      )}

      {isMobile && (
        <div
          className="uiv2-mobile-drawer-layer"
          aria-hidden={!mobileNavOpen && dragX === null}
          style={{
            pointerEvents: drawerProgress > .02 ? 'auto' : 'none',
            visibility: drawerProgress > .02 ? 'visible' : 'hidden',
          }}
        >
          <button
            type="button"
            className="uiv2-mobile-drawer-backdrop"
            aria-label="Cerrar menú"
            onClick={() => closeDrawer(true)}
            style={{
              opacity: drawerProgress * .72,
              transition: isDragging ? 'none' : 'opacity 240ms cubic-bezier(.2,0,0,1)',
            }}
          />
          <div
            id="uiv2-mobile-navigation"
            ref={drawerRef}
            className="uiv2-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de administración"
            style={{ transform: `translate3d(${drawerX}px, 0, 0)`, transition: drawerTransition }}
          >
            <Sidebar
              items={navItems}
              active={activeNav}
              onSelect={id => {
                onSelectNav(id)
                closeDrawer()
              }}
              header={sidebarHeader}
              footer={sidebarFooter}
            />
          </div>
        </div>
      )}

      <div className="uiv2-main-column">
        <Header
          title={pageTitle}
          breadcrumb={breadcrumb}
          actions={
            <>
              {isMobile && (
                <button
                  ref={menuButtonRef}
                  type="button"
                  className="uiv2-mobile-menu-button"
                  onClick={() => setMobileNavOpen(open => !open)}
                  aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
                  aria-expanded={mobileNavOpen}
                  aria-controls="uiv2-mobile-navigation"
                >
                  <IconMenu width={19} height={19} aria-hidden="true" />
                </button>
              )}
              {headerActions}
            </>
          }
        />

        <main className="uiv2-page-container">
          <div className="uiv2-page-frame">
            <div key={activeNav} className="uiv2-page-enter">{children}</div>
          </div>
        </main>
      </div>

      <style>{`
        .uiv2-app-shell {
          box-sizing: border-box;
          width: 100%;
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          position: fixed;
          inset: 0;
          display: flex;
          overflow: hidden;
          background: ${colors.bg[900]};
          color: ${colors.text[900]};
          font-family: Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        .uiv2-main-column {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          position: relative;
          background: ${colors.bg[900]};
        }
        .uiv2-page-container {
          min-height: 0;
          flex: 1;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: clamp(24px, 2.2vw, 32px);
          padding-right: max(clamp(24px, 2.2vw, 32px), env(safe-area-inset-right, 0px));
          padding-bottom: max(clamp(24px, 2.2vw, 32px), env(safe-area-inset-bottom, 0px));
          padding-left: max(clamp(24px, 2.2vw, 32px), env(safe-area-inset-left, 0px));
          position: relative;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: ${colors.border.default} transparent;
          touch-action: pan-y;
        }
        .uiv2-page-frame { width: 100%; max-width: 1600px; margin: 0 auto; }
        .uiv2-page-enter { width: 100%; position: relative; animation: uiv2PageEnter 220ms cubic-bezier(.16,1,.3,1); }
        .uiv2-mobile-menu-button {
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid ${colors.border.default};
          border-radius: 12px;
          background: ${colors.bg[600]};
          color: ${colors.text[900]};
          cursor: pointer;
          touch-action: manipulation;
        }
        .uiv2-mobile-menu-button:focus-visible { outline: 2px solid ${colors.primary.base}; outline-offset: 2px; }
        .uiv2-mobile-drawer-layer { position: fixed; inset: 0; z-index: 100; }
        .uiv2-mobile-drawer-backdrop {
          width: 100%;
          height: 100%;
          position: absolute;
          inset: 0;
          z-index: 0;
          padding: 0;
          border: 0;
          background: rgba(3, 6, 12, .78);
          cursor: default;
          -webkit-backdrop-filter: blur(3px);
          backdrop-filter: blur(3px);
        }
        .uiv2-mobile-drawer {
          width: var(--uiv2-drawer-width);
          height: 100vh;
          height: 100dvh;
          position: absolute;
          inset: 0 auto 0 0;
          z-index: 1;
          will-change: transform;
          box-shadow: 24px 0 64px rgba(0,0,0,.42);
        }
        @keyframes uiv2PageEnter {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1023px) {
          .uiv2-page-container {
            padding-top: 20px;
            padding-right: max(20px, env(safe-area-inset-right, 0px));
            padding-bottom: max(24px, env(safe-area-inset-bottom, 0px));
            padding-left: max(20px, env(safe-area-inset-left, 0px));
          }
        }
        @media (max-width: 640px) {
          .uiv2-page-container {
            padding-top: 16px;
            padding-right: max(14px, env(safe-area-inset-right, 0px));
            padding-bottom: max(20px, env(safe-area-inset-bottom, 0px));
            padding-left: max(14px, env(safe-area-inset-left, 0px));
          }
          .uiv2-mobile-menu-button { width: 44px; height: 44px; flex-basis: 44px; }
          button, [role="button"], a { min-height: 44px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .uiv2-page-enter { animation: none; }
          .uiv2-mobile-drawer,
          .uiv2-mobile-drawer-backdrop { transition: none !important; }
        }
      `}</style>
    </div>
  )
}
