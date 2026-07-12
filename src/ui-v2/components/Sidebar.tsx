import type { ReactNode } from 'react'
import { colors } from '../design-system/colors'

export interface SidebarItem {
  id: string
  label: string
  icon: ReactNode
  group?: string
}

export interface SidebarProps {
  items: SidebarItem[]
  active: string
  onSelect: (id: string) => void
  header?: ReactNode
  footer?: ReactNode
}

export function Sidebar({ items, active, onSelect, header, footer }: SidebarProps) {
  return (
    <aside className="uiv2-sidebar">
      {header && <div className="uiv2-sidebar-header">{header}</div>}

      <nav className="uiv2-sidebar-nav" aria-label="Navegación principal">
        {items.map((item, index) => {
          const isActive = item.id === active
          const startsGroup = Boolean(item.group && item.group !== items[index - 1]?.group)

          return (
            <div className="uiv2-sidebar-entry" key={item.id}>
              {startsGroup && <div className="uiv2-sidebar-group">{item.group}</div>}
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`uiv2-sidebar-item${isActive ? ' uiv2-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="uiv2-sidebar-icon" aria-hidden="true">{item.icon}</span>
                <span className="uiv2-sidebar-label">{item.label}</span>
              </button>
            </div>
          )
        })}
      </nav>

      {footer && <div className="uiv2-sidebar-footer">{footer}</div>}

      <style>{`
        .uiv2-sidebar {
          box-sizing: border-box;
          width: 240px;
          height: 100%;
          min-height: 0;
          flex: 0 0 240px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: ${colors.bg[800]};
          border-right: 1px solid ${colors.border.subtle};
          color: ${colors.text[700]};
        }
        .uiv2-sidebar-header {
          box-sizing: border-box;
          min-height: calc(64px + env(safe-area-inset-top, 0px));
          padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 13px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid ${colors.border.subtle};
        }
        .uiv2-sidebar-header > * { width: 100%; }
        .uiv2-sidebar-nav {
          flex: 1;
          min-height: 0;
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: ${colors.border.default} transparent;
        }
        .uiv2-sidebar-entry { width: 100%; }
        .uiv2-sidebar-group {
          padding: 17px 10px 7px;
          color: ${colors.text[300]};
          font-size: 9px;
          font-weight: 650;
          letter-spacing: .105em;
          line-height: 1.2;
          text-transform: uppercase;
        }
        .uiv2-sidebar-entry:first-child .uiv2-sidebar-group { padding-top: 3px; }
        .uiv2-sidebar-item {
          box-sizing: border-box;
          width: 100%;
          min-height: 42px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 11px;
          position: relative;
          overflow: hidden;
          border: 1px solid transparent;
          border-radius: 11px;
          background: transparent;
          color: ${colors.text[500]};
          cursor: pointer;
          font: 500 12.5px/1 inherit;
          text-align: left;
          transition: color 150ms cubic-bezier(.2,0,0,1), background 150ms cubic-bezier(.2,0,0,1), border-color 150ms cubic-bezier(.2,0,0,1), transform 150ms cubic-bezier(.2,0,0,1);
        }
        .uiv2-sidebar-item::before {
          content: '';
          width: 2px;
          height: 20px;
          position: absolute;
          left: 0;
          top: 50%;
          border-radius: 0 999px 999px 0;
          background: ${colors.primary.base};
          opacity: 0;
          transform: translateY(-50%) scaleY(.5);
          transition: opacity 150ms cubic-bezier(.2,0,0,1), transform 150ms cubic-bezier(.2,0,0,1);
        }
        .uiv2-sidebar-item:hover {
          background: rgba(var(--uiv2-overlay-rgb), .035);
          color: ${colors.text[900]};
        }
        .uiv2-sidebar-item:active { transform: scale(.985); }
        .uiv2-sidebar-item:focus-visible { outline: 2px solid ${colors.primary.base}; outline-offset: 1px; }
        .uiv2-sidebar-item.uiv2-active {
          border-color: color-mix(in srgb, ${colors.primary.base} 18%, transparent);
          background: ${colors.primary.dim};
          color: ${colors.text[900]};
          font-weight: 600;
        }
        .uiv2-sidebar-item.uiv2-active::before { opacity: 1; transform: translateY(-50%) scaleY(1); }
        .uiv2-sidebar-icon {
          width: 19px;
          height: 19px;
          flex: 0 0 19px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: currentColor;
          transition: color 150ms cubic-bezier(.2,0,0,1);
        }
        .uiv2-sidebar-icon > span,
        .uiv2-sidebar-icon svg { width: 19px !important; height: 19px !important; display: inline-flex; align-items: center; justify-content: center; }
        .uiv2-sidebar-item.uiv2-active .uiv2-sidebar-icon { color: ${colors.primary.light}; }
        .uiv2-sidebar-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .uiv2-sidebar-footer {
          flex: 0 0 auto;
          padding: 13px 13px max(13px, env(safe-area-inset-bottom, 0px));
          border-top: 1px solid ${colors.border.subtle};
          background: ${colors.bg[800]};
        }
        @media (prefers-reduced-motion: reduce) {
          .uiv2-sidebar-item,
          .uiv2-sidebar-item::before,
          .uiv2-sidebar-icon { transition: none; }
        }
      `}</style>
    </aside>
  )
}
