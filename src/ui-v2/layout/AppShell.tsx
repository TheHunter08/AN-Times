import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from '../components/Sidebar.js'
import type { SidebarItem } from '../components/Sidebar.js'
import { Header } from '../components/Header.js'
import { IconMenu } from '../components/Icons.js'
import { colors } from '../design-system/colors'

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

export function AppShell({
  navItems, activeNav, onSelectNav, sidebarHeader, sidebarFooter,
  pageTitle, breadcrumb, headerActions, children,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900)
  // Live drag offset: null = snapped, number = current drawer X position (-DRAWER_W to 0)
  const [dragX, setDragX] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const axisLockedRef = useRef<'h' | 'v' | null>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Cerrar drawer al cambiar de página
  useEffect(() => {
    setMobileNavOpen(false)
    setDragX(null)
  }, [activeNav])

  // Gesto real-time: el drawer sigue el dedo en iOS
  useEffect(() => {
    if (!isMobile) return

    const onStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      axisLockedRef.current = null
      draggingRef.current = false
    }

    const onMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return
      const sx = touchStartX.current
      const sy = touchStartY.current
      const cx = e.touches[0].clientX
      const cy = e.touches[0].clientY
      const dx = cx - sx
      const dy = cy - sy

      // Lock axis after first significant movement
      if (!axisLockedRef.current) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        axisLockedRef.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (axisLockedRef.current !== 'h') return

      if (!mobileNavOpen) {
        // Opening: only from left edge
        if (sx > 30) return
        draggingRef.current = true
        e.preventDefault()
        const newX = Math.min(Math.max(-DRAWER_W + dx, -DRAWER_W), 0)
        setDragX(newX)
      } else {
        // Closing: any start position, swipe left
        if (dx > 0) { setDragX(0); return }
        draggingRef.current = true
        e.preventDefault()
        const newX = Math.min(Math.max(dx, -DRAWER_W), 0)
        setDragX(newX)
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return
      const dx = e.changedTouches[0].clientX - touchStartX.current
      const dt = Date.now()

      if (!mobileNavOpen) {
        if (draggingRef.current) {
          // Snap: open if dragged past 40% or fast flick
          if (dx > DRAWER_W * 0.4 || dx > 55) setMobileNavOpen(true)
          else setMobileNavOpen(false)
        } else if (dx > 55 && touchStartX.current < 30) {
          setMobileNavOpen(true)
        }
      } else {
        if (draggingRef.current) {
          if (dx < -DRAWER_W * 0.4 || dx < -55) setMobileNavOpen(false)
          else setMobileNavOpen(true)
        } else if (dx < -55) {
          setMobileNavOpen(false)
        }
      }

      setDragX(null)
      draggingRef.current = false
      axisLockedRef.current = null
      touchStartX.current = null
      touchStartY.current = null
    }

    // Non-passive so we can preventDefault on horizontal drags
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [isMobile, mobileNavOpen])

  // Compute drawer translate X and overlay opacity from drag state
  const drawerX = dragX !== null ? dragX : (mobileNavOpen ? 0 : -DRAWER_W)
  const drawerProgress = (drawerX + DRAWER_W) / DRAWER_W // 0 = closed, 1 = open
  const overlayOpacity = drawerProgress * 0.55
  const isDragging = dragX !== null
  const transition = isDragging ? 'none' : 'transform .26s cubic-bezier(.32,1,.23,1)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'flex',
        background: `radial-gradient(1200px 700px at 15% -10%, rgba(59,91,255,0.07), transparent 60%), ${colors.bg[800]}`,
        color: colors.text[900],
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'none', opacity: .035, mixBlendMode: 'overlay',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Sidebar escritorio */}
      {!isMobile && (
        <Sidebar items={navItems} active={activeNav} onSelect={onSelectNav} header={sidebarHeader} footer={sidebarFooter} />
      )}

      {/* Drawer móvil con gesto real-time */}
      {isMobile && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            pointerEvents: drawerProgress > 0.05 ? 'auto' : 'none',
          }}
        >
          {/* Sidebar panel */}
          <div
            style={{
              width: DRAWER_W, height: '100%',
              transform: `translateX(${drawerX}px)`,
              transition,
              willChange: 'transform',
              position: 'absolute', top: 0, left: 0,
            }}
          >
            <Sidebar
              items={navItems}
              active={activeNav}
              onSelect={id => { onSelectNav(id); setMobileNavOpen(false); setDragX(null) }}
              header={sidebarHeader}
              footer={sidebarFooter}
            />
          </div>

          {/* Overlay */}
          <div
            style={{
              position: 'absolute', inset: 0, left: DRAWER_W,
              background: 'rgba(0,0,0,.55)',
              opacity: overlayOpacity,
              transition: isDragging ? 'none' : 'opacity .26s ease',
              WebkitBackdropFilter: overlayOpacity > 0.1 ? 'blur(4px)' : 'none',
              backdropFilter: overlayOpacity > 0.1 ? 'blur(4px)' : 'none',
              pointerEvents: mobileNavOpen ? 'auto' : 'none',
            }}
            onClick={() => { setMobileNavOpen(false); setDragX(null) }}
          />
        </div>
      )}

      {/* Contenido principal */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <Header
          title={pageTitle}
          breadcrumb={breadcrumb}
          actions={
            <>
              {isMobile && (
                <button
                  onClick={() => setMobileNavOpen(o => !o)}
                  aria-label="Menú"
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    border: `1px solid ${colors.border.default}`,
                    background: colors.bg[600], color: colors.text[900],
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <IconMenu width={16} height={16} />
                </button>
              )}
              {headerActions}
            </>
          }
        />
        <main
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto',
            padding: isMobile ? '16px 14px' : '32px 36px',
            position: 'relative',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div key={activeNav} className="uiv2-page-enter" style={{ position: 'relative', zIndex: 1 }}>{children}</div>
        </main>
        <style>{`
          @keyframes uiv2PageEnter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          .uiv2-page-enter { animation: uiv2PageEnter 280ms cubic-bezier(0.16, 1, 0.3, 1); }
        `}</style>
      </div>
    </div>
  )
}
