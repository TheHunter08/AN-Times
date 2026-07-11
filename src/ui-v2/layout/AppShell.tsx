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

export function AppShell({
  navItems, activeNav, onSelectNav, sidebarHeader, sidebarFooter,
  pageTitle, breadcrumb, headerActions, children,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Cerrar drawer al cambiar de página
  useEffect(() => { if (mobileNavOpen) setMobileNavOpen(false) }, [activeNav])

  // Gesto iOS: deslizar desde el borde izquierdo abre el sidebar
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx > 55 && touchStartX.current < 30) setMobileNavOpen(true)
    if (dx < -55) setMobileNavOpen(false)
    touchStartX.current = null
  }

  return (
    <div
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
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

      {/* Drawer móvil con animación fluida y overlay */}
      {isMobile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: mobileNavOpen ? 'auto' : 'none' }}>
          <div style={{
            width: 240, height: '100%',
            transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .26s cubic-bezier(.32,1,.23,1)',
            willChange: 'transform',
          }}>
            <Sidebar
              items={navItems}
              active={activeNav}
              onSelect={id => { onSelectNav(id); setMobileNavOpen(false) }}
              header={sidebarHeader}
              footer={sidebarFooter}
            />
          </div>
          <div
            style={{
              position: 'absolute', inset: 0, left: 240,
              background: 'rgba(0,0,0,.5)',
              opacity: mobileNavOpen ? 1 : 0,
              transition: 'opacity .26s ease',
              WebkitBackdropFilter: 'blur(4px)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setMobileNavOpen(false)}
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
