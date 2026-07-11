import { useMemo, useCallback } from 'react'
import { vacData, p2, calcMin, mhm, today, localDateStr } from '../../utils/time.js'
import { calcStreak } from '../../utils/streaks.js'
import { applyBrandColor } from '../../utils/webauthn.js'
import TabGastos from '../TabGastos.jsx'
import TabDenuncia from '../TabDenuncia.jsx'
import { PullToRefresh } from './PullToRefresh.jsx'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: .45 }}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

function MenuRow({ icon, iconBg, label, sub, badge, badgeColor, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 18px', background: 'transparent', border: 'none',
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = `${colors.bg[400]}80` }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: radius.sm,
        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text[900], lineHeight: 1.2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: colors.semantic.orange, marginTop: 2 }}>{sub}</div>}
      </div>
      {badge != null && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: radius.pill,
          background: badgeColor || colors.semantic.orange, color: '#fff',
          fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px', flexShrink: 0,
        }}>{badge}</span>
      )}
      <ChevronRight />
    </button>
  )
}

export function TabPerfil({ u, session, db, saveDB, toast, doLogout, openModal, perfilView = 'perfil', setPerfilView }) {
  const myRecs = useMemo(() => (db.records || []).filter(r => r.empId === u.id && r.fin), [db.records, u.id])

  const saveAccentColor = useCallback((color) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, accentColor: color || undefined } : e)
    saveDB({ employees: emps2 })
    if (color) applyBrandColor(color)
  }, [db.employees, u.id, saveDB])

  const saveReminderTime = useCallback((time) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, reminderTime: time || undefined } : e)
    saveDB({ employees: emps2 })
    if (time && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    toast(time ? `Recordatorio activado a las ${time}` : 'Recordatorio desactivado', 2500, 'ok')
  }, [db.employees, u.id, saveDB, toast])

  if (perfilView === 'gastos')   return <TabGastos db={db} u={u} toast={toast} saveDB={saveDB} onBack={() => setPerfilView('perfil')} />
  if (perfilView === 'denuncia') return <TabDenuncia db={db} u={u} toast={toast} saveDB={saveDB} onBack={() => setPerfilView('perfil')} />

  if (!db.records) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[140, 80, 200].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />
      ))}
    </div>
  )

  const initials = u.initials || u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const vac = vacData(u.id, db)
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const pendingDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma).length
  const pendingCierres = (db.cierres || []).filter(c => c.empId === u.id && c.estado === 'pendiente' && !c.desactualizado)
  const hasFirma = !!db.firmas?.[u?.id]?.main

  const yearStr = `${now.getFullYear()}-`
  const yearRecs = myRecs.filter(r => r.inicio?.startsWith(yearStr))
  const yearMin = yearRecs.reduce((s, r) => s + calcMin(r), 0)
  const yearDays = new Set(yearRecs.map(r => localDateStr(new Date(r.inicio)))).size
  const dayMap = {}
  myRecs.forEach(r => { if (!r.inicio) return; const d = localDateStr(new Date(r.inicio)); dayMap[d] = (dayMap[d]||0) + calcMin(r) })
  const recordMin = Math.max(0, ...Object.values(dayMap).filter(Boolean))
  const streak = calcStreak(db.records, u.id, today())

  const roleLabel = u.role === 'encargado' ? 'Encargado' : u.role === 'jefe_obra' ? 'Jefe de Obra' : 'Empleado'
  const avatarColor = colors.avatarPalette[Math.abs(u.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.avatarPalette.length]

  return (
    <PullToRefresh>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto', paddingBottom: 100 }}>

        {/* ── Hero ───────────────────────────────────────────── */}
        <div style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius['2xl'], padding: '28px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          position: 'relative', overflow: 'hidden', margin: '16px 16px 0',
        }}>
          <div style={{
            position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
            width: 280, height: 280, borderRadius: '50%',
            background: `radial-gradient(circle, ${avatarColor}18 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-1px',
            boxShadow: `0 0 28px ${avatarColor}50`,
            marginBottom: 14,
          }}>{initials}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: colors.text[900], letterSpacing: '-.4px', marginBottom: 4 }}>{u.name}</div>
          <div style={{ fontSize: 12, color: colors.text[500], marginBottom: 10 }}>
            {u.empresa || u.centroTrabajo || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: radius.pill,
              background: `${avatarColor}18`, border: `1px solid ${avatarColor}35`,
              fontSize: 11, fontWeight: 700, color: avatarColor,
            }}>
              {u.role === 'encargado' ? '⭐' : u.role === 'jefe_obra' ? '🏗️' : '👷'} {roleLabel}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: radius.pill,
              background: `${colors.semantic.green}15`, border: `1px solid ${colors.semantic.green}30`,
              fontSize: 11, fontWeight: 700, color: colors.semantic.green,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.semantic.green, display: 'inline-block' }} />
              Activo
            </span>
          </div>
        </div>

        {/* ── Stats grid ─────────────────────────────────────── */}
        <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { val: mhm(monthMin), lbl: 'Horas este mes', ico: '📅', color: colors.primary.light, bg: colors.primary.dim },
            { val: String(vac.available), lbl: 'Días de vacaciones', ico: '🌴', color: colors.semantic.green, bg: `${colors.semantic.green}12` },
            { val: `${streak}`, lbl: 'Racha actual', ico: '🔥', color: colors.semantic.orange, bg: `${colors.semantic.orange}12` },
            { val: yearDays > 0 ? `${yearDays}` : '—', lbl: `Días trabajados ${now.getFullYear()}`, ico: '🏆', color: colors.kpiTone.cyan.base, bg: colors.kpiTone.cyan.dim },
          ].map(({ val, lbl, ico, color, bg }) => (
            <div key={lbl} style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.xl, padding: '16px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: radius.sm,
                  background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                }}>{ico}</div>
                <div style={{ fontSize: 10, color: colors.text[500], fontWeight: 600, lineHeight: 1.3, flex: 1 }}>{lbl}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-.5px', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Pending items ─────────────────────────────────── */}
        {pendingCierres.length > 0 && (
          <div
            onClick={() => openModal('cierreSign')}
            style={{
              margin: '0 16px', padding: '12px 16px',
              background: `${colors.semantic.orange}10`, border: `1px solid ${colors.semantic.orange}30`,
              borderRadius: radius.lg, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <span style={{ fontSize: 22 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.semantic.orange }}>Cierre mensual pendiente de firma</div>
              <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2 }}>
                {pendingCierres.map(c => c.mes).join(', ')} · Toca para revisar y firmar
              </div>
            </div>
            <span style={{
              minWidth: 22, height: 22, borderRadius: radius.pill,
              background: colors.semantic.orange, color: '#fff',
              fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 5px', flexShrink: 0,
            }}>{pendingCierres.length}</span>
          </div>
        )}

        {/* ── Section: Más opciones ─────────────────────────── */}
        <SectionCard title="Más opciones">
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.semantic.green} strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
            iconBg={`${colors.semantic.green}15`}
            label="Gastos"
            onClick={() => setPerfilView('gastos')}
          />
          <RowDivider />
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.primary.light} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
            iconBg={`${colors.primary.base}15`}
            label="Denuncia"
            onClick={() => setPerfilView('denuncia')}
          />
        </SectionCard>

        {/* ── Section: Mi cuenta ────────────────────────────── */}
        <SectionCard title="Mi cuenta">
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.primary.light} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
            iconBg={`${colors.primary.base}15`}
            label="Información personal"
            onClick={() => openModal('infoPersonal')}
          />
          <RowDivider />
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#60a5fa" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
            iconBg={`${colors.accent.base}15`}
            label="Documentos"
            sub={pendingDocs > 0 ? `${pendingDocs} pendiente${pendingDocs > 1 ? 's' : ''} de firma` : undefined}
            badge={pendingDocs > 0 ? pendingDocs : undefined}
            onClick={() => openModal('documentos')}
          />
          <RowDivider />
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a78bfa" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
            iconBg="rgba(124,92,255,0.15)"
            label="Firma digital"
            sub={!hasFirma ? 'Sin configurar' : undefined}
            badge={!hasFirma ? '!' : undefined}
            onClick={() => openModal('sign')}
          />
          <RowDivider />
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.semantic.green} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" fill={colors.semantic.green} stroke="none"/></svg>}
            iconBg={`${colors.semantic.green}15`}
            label="Mi código QR"
            onClick={() => openModal('miQR')}
          />
        </SectionCard>

        {/* ── Section: Personalización ──────────────────────── */}
        <SectionCard title="Personalización">
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8b5cf6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>}
            iconBg="rgba(139,92,246,0.15)"
            label="Temas y colores"
            onClick={() => openModal('temas')}
          />
          <RowDivider />
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.secondary.base} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}
            iconBg={colors.secondary.dim}
            label="Configuración"
            onClick={() => openModal('configuracion')}
          />
          <RowDivider />
          <MenuRow
            icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.kpiTone.amber.base} strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>}
            iconBg={colors.kpiTone.amber.dim}
            label="Logros"
            onClick={() => openModal('logros')}
          />
        </SectionCard>

        {/* ── Logout ─────────────────────────────────────────── */}
        <div style={{ padding: '0 16px' }}>
          <button onClick={doLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 18px', borderRadius: radius.xl,
            background: `${colors.semantic.red}08`, border: `1px solid ${colors.semantic.red}25`,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = `${colors.semantic.red}14` }}
            onMouseLeave={e => { e.currentTarget.style.background = `${colors.semantic.red}08` }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: radius.sm,
              background: `${colors.semantic.red}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.semantic.red} strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: colors.semantic.red, textAlign: 'left' }}>Cerrar sesión</span>
            <ChevronRight />
          </button>
        </div>

        {/* ── Audit history ──────────────────────────────────── */}
        {(() => {
          const myAudit = (db.audit || [])
            .filter(a => a.detail?.includes(u.name) || a.empId === u.id || (a.detail && a.detail.includes(u.id)))
            .slice(-20).reverse()
          if (!myAudit.length) return null
          return (
            <div style={{
              margin: '0 16px', background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.xl, overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 18px 10px', fontSize: 12, fontWeight: 660, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Historial de cambios
              </div>
              {myAudit.slice(0, 5).map((a, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '11px 18px',
                  borderTop: `1px solid ${colors.border.subtle}`,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: radius.sm,
                    background: colors.bg[400], display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, flexShrink: 0,
                  }}>📋</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.text[700], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action}</div>
                    {a.detail && <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</div>}
                    <div style={{ fontSize: 10, color: colors.text[300], marginTop: 2 }}>{new Date(a.ts).toLocaleString('es-ES')}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        <div style={{ height: 4 }} />
      </div>
    </PullToRefresh>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={{ margin: '0 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 660, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingLeft: 4 }}>
        {title}
      </div>
      <div style={{
        background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.xl, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function RowDivider() {
  return <div style={{ height: 1, background: colors.border.subtle, marginLeft: 64 }} />
}
