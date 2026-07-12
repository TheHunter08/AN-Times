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
          background: `linear-gradient(160deg, ${avatarColor}20 0%, ${colors.bg[600]} 55%)`,
          border: `1px solid ${avatarColor}30`,
          borderRadius: radius['2xl'], padding: '36px 24px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          position: 'relative', overflow: 'hidden', margin: '16px 16px 0',
          boxShadow: `0 12px 48px ${avatarColor}20`,
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${avatarColor}, ${colors.primary.base})`, borderRadius: `${radius['2xl']} ${radius['2xl']} 0 0` }} />
          <div style={{
            position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
            width: 400, height: 400, borderRadius: '50%',
            background: `radial-gradient(circle, ${avatarColor}18 0%, transparent 65%)`,
            pointerEvents: 'none',
          }} />
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: `linear-gradient(135deg, ${avatarColor} 0%, ${avatarColor}cc 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-1px',
            boxShadow: `0 0 0 4px ${avatarColor}25, 0 8px 40px ${avatarColor}55`,
            marginBottom: 18,
          }}>{initials}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: colors.text[900], letterSpacing: '-.8px', marginBottom: 4 }}>{u.name}</div>
          <div style={{ fontSize: 12, color: colors.text[500], marginBottom: 14 }}>
            {u.empresa || u.centroTrabajo || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: radius.pill,
              background: `${avatarColor}20`, border: `1px solid ${avatarColor}40`,
              fontSize: 12, fontWeight: 700, color: avatarColor,
            }}>
              {roleLabel}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: radius.pill,
              background: `${colors.semantic.green}15`, border: `1px solid ${colors.semantic.green}35`,
              fontSize: 12, fontWeight: 700, color: colors.semantic.green,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.semantic.green, display: 'inline-block', boxShadow: `0 0 6px ${colors.semantic.green}` }} />
              Activo
            </span>
          </div>
        </div>

        {/* ── Stats grid ─────────────────────────────────────── */}
        <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            {
              val: mhm(monthMin), lbl: 'Horas este mes',
              accent: colors.primary.base, color: colors.primary.light,
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
                </svg>
              ),
            },
            {
              val: String(vac.available), lbl: 'Vacaciones disp.',
              accent: colors.semantic.green, color: colors.semantic.green,
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              ),
            },
            {
              val: `${streak}`, lbl: 'Racha actual',
              accent: colors.semantic.orange, color: colors.semantic.orange,
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2c0 6-6 8-6 14a6 6 0 0 0 12 0c0-6-6-8-6-14z"/>
                  <path d="M12 12c0 3-2 4-2 6a2 2 0 0 0 4 0c0-2-2-3-2-6z"/>
                </svg>
              ),
            },
            {
              val: yearDays > 0 ? `${yearDays}` : '—', lbl: `Días ${now.getFullYear()}`,
              accent: colors.primary.base, color: colors.primary.light,
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              ),
            },
          ].map(({ val, lbl, accent, color, icon }) => (
            <div key={lbl} style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.xl, padding: '16px 14px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: '12px 12px 0 0' }} />
              <div style={{
                width: 34, height: 34, borderRadius: radius.md,
                background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 12,
              }}>
                {icon(color)}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color, letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>{val}</div>
              <div style={{ fontSize: 10, color: colors.text[500], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>{lbl}</div>
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
            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${colors.semantic.orange}15`, border: `1px solid ${colors.semantic.orange}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={colors.semantic.orange} strokeWidth="2" width="18" height="18"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
            </div>
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

        <div style={{ height: 4 }} />
      </div>
    </PullToRefresh>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={{ margin: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 2 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: colors.primary.base }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.7px' }}>
          {title}
        </div>
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
