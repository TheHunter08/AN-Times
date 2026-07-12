import type { ReactNode } from 'react'
import { colors } from '../design-system/colors'

export interface HeaderProps {
  title: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
}

export function Header({ title, breadcrumb, actions }: HeaderProps) {
  const hasContext = Boolean(title)

  return (
    <header className="uiv2-desktop-topbar">
      {hasContext && (
        <div className="uiv2-header-context">
          {breadcrumb && <div className="uiv2-header-breadcrumb">{breadcrumb}</div>}
          <div className="uiv2-header-title">{title}</div>
        </div>
      )}
      {actions && <div className="uiv2-header-actions">{actions}</div>}

      <style>{`
        .uiv2-desktop-topbar {
          box-sizing: border-box;
          width: 100%;
          min-height: calc(64px + env(safe-area-inset-top, 0px));
          padding: env(safe-area-inset-top, 0px) clamp(16px, 2vw, 28px) 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex: 0 0 auto;
          position: relative;
          z-index: 20;
          background: ${colors.bg[700]};
          border-bottom: 1px solid ${colors.border.subtle};
        }
        .uiv2-header-context {
          min-width: 0;
          max-width: 280px;
          flex: 0 1 280px;
        }
        .uiv2-header-breadcrumb {
          margin-bottom: 3px;
          overflow: hidden;
          color: ${colors.text[500]};
          font-size: 9.5px;
          font-weight: 650;
          letter-spacing: .08em;
          line-height: 1.1;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .uiv2-header-title {
          overflow: hidden;
          color: ${colors.text[900]};
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -.015em;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .uiv2-header-actions {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .uiv2-header-actions > div {
          min-width: 0;
          width: 100%;
          max-width: 920px;
          flex: 1;
          justify-content: flex-end;
        }
        .uiv2-header-actions > div > div:first-child {
          min-width: 180px;
          max-width: 420px;
        }
        .uiv2-header-actions button {
          min-width: 36px;
          min-height: 36px;
          transition: color 140ms cubic-bezier(.2,0,0,1), background 140ms cubic-bezier(.2,0,0,1), border-color 140ms cubic-bezier(.2,0,0,1), transform 140ms cubic-bezier(.2,0,0,1);
        }
        .uiv2-header-actions button:hover { color: ${colors.text[900]} !important; border-color: ${colors.border.default} !important; background: ${colors.bg[500]} !important; }
        .uiv2-header-actions button:active { transform: scale(.97); }
        .uiv2-header-actions button:focus-visible { outline: 2px solid ${colors.primary.base}; outline-offset: 2px; }
        @media (max-width: 760px) {
          .uiv2-desktop-topbar { gap: 10px; padding-left: max(14px, env(safe-area-inset-left, 0px)); padding-right: max(14px, env(safe-area-inset-right, 0px)); }
          .uiv2-header-context { display: none; }
          .uiv2-header-actions { justify-content: space-between; }
          .uiv2-header-actions > div { width: auto; flex: 0 1 auto; }
          .uiv2-header-actions > div > div:first-child { display: none; }
        }
        @media (max-width: 430px) {
          .uiv2-header-actions > div { gap: 7px !important; }
          .uiv2-header-actions > div > div:last-child > span { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .uiv2-header-actions button { transition: none; }
        }
      `}</style>
    </header>
  )
}
