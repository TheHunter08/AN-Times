import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from '../components/Sidebar.js'
import type { SidebarItem } from '../components/Sidebar.js'
import { Header } from '../components/Header.js'
import { colors } from '../design-system/colors.js'

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

// Layout responsive: sidebar fija en escritorio, oculta tras un botón de
// menú en móvil (drawer superpuesto) — mismo patrón ya probado en la UI
// actual, reimplementado limpio para ui-v2.
export function AppShell({
  navItems, activeNav, onSelectNav, sidebarHeader, sidebarFooter,
  pageTitle, breadcrumb, headerActions, children,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 900

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: colors.bg[800], color: colors.text[900], fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
      {!isMobile && (
        <Sidebar items={navItems} active={activeNav} onSelect={onSelectNav} header={sidebarHeader} footer={sidebarFooter} />
      )}
      {isMobile && mobileNavOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ width: 232 }}>
            <Sidebar
              items={navItems}
              active={activeNav}
              onSelect={id => { onSelectNav(id); setMobileNavOpen(false) }}
              header={sidebarHeader}
              footer={sidebarFooter}
            />
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,.5)' }} onClick={() => setMobileNavOpen(false)} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header
          title={pageTitle}
          breadcrumb={breadcrumb}
          actions={
            <>
              {isMobile && (
                <button
                  onClick={() => setMobileNavOpen(o => !o)}
                  aria-label="Menú"
                  style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], cursor: 'pointer' }}
                >
                  ☰
                </button>
              )}
              {headerActions}
            </>
          }
        />
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
