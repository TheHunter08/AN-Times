import { useState } from 'react';

const colors = {
  bg: { 600: 'var(--bg-card)', 400: 'var(--bg-card-hover)' },
  primary: { base: 'var(--brand-500)', light: 'var(--brand-400)', dim: 'color-mix(in srgb, var(--brand-500) 13%, transparent)' },
  semantic: { green: 'var(--success-400)', orange: 'var(--warning-400)' },
  text: { 900: 'var(--text-primary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
};
const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', pill: 'var(--radius-pill)' };
const toneSoft = (color, amount = 14) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(date) {
  return `${date.getDate()} ${date.toLocaleString('es', { month: 'short' })}`;
}

function tipoTone(tipo) {
  if (tipo === 'guardia') return colors.semantic.orange;
  if (tipo === 'libre')   return colors.semantic.green;
  return colors.primary.light;
}

export default function TabTurnos({ db, u }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const turnos = (db.turnos || []).filter((t) => t.empId === u.id);

  // Build 7-day array for current week
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const todayYMD = toYMD(new Date());

  function getTurno(date) {
    const ymd = toYMD(date);
    return turnos.find((t) => t.fecha === ymd) || null;
  }

  function prevWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  // Upcoming shifts: next 3 from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = turnos
    .filter((t) => t.fecha >= toYMD(today) && t.tipo !== 'libre')
    .sort((a, b) => (a.fecha||'').localeCompare(b.fecha||''))
    .slice(0, 3);

  const weekLabel = (() => {
    const end = days[6];
    return `${formatDateLabel(weekStart)} – ${formatDateLabel(end)}`;
  })();

  return (
    <div className="employee-shifts-v2" style={{ padding: 'var(--space-4)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 520, margin: '0 auto' }}>

      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ margin: 0, color: colors.text[900], fontSize: 'var(--font-heading-xl)', fontWeight: 'var(--font-semibold)', letterSpacing: '-.035em' }}>Mis turnos</h1>
        <p style={{ margin: 0, color: colors.text[500], fontSize: 'var(--font-body-sm)' }}>Consulta tu horario semanal y los próximos turnos.</p>
      </header>

      {/* Upcoming shifts */}
      {upcoming.length > 0 && (
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[500], fontWeight: 700 }}>
            Próximos turnos
          </h2>
          <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, overflow: 'hidden' }}>
            {upcoming.map((t, i) => {
              const d = new Date(t.fecha + 'T00:00:00');
              const isToday = t.fecha === todayYMD;
              return (
                <div key={t.id} style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderTop: i > 0 ? `1px solid ${colors.border.subtle}` : 'none',
                  background: isToday ? toneSoft(colors.primary.base, 6) : 'transparent',
                }}>
                  <div>
                    <span style={{ color: colors.text[900], fontWeight: 700, fontSize: 13.5 }}>
                      {DAY_NAMES_FULL[d.getDay()]}
                    </span>
                    <span style={{ color: colors.text[500], fontSize: 12, marginLeft: 8 }}>
                      {formatDateLabel(d)}
                    </span>
                    {isToday && (
                      <span style={{ marginLeft: 8, fontSize: 10, background: colors.primary.base, color: '#fff', borderRadius: radius.sm, padding: '1px 7px', fontWeight: 700 }}>
                        HOY
                      </span>
                    )}
                  </div>
                  <span style={{ color: colors.text[900], fontSize: 13, fontWeight: 600 }}>
                    {t.horaInicio} → {t.horaFin}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={prevWeek} aria-label="Semana anterior" style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.sm, color: colors.text[900],
          width: 36, height: 36, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          ‹
        </button>
        <span style={{ color: colors.text[500], fontSize: 12.5, fontWeight: 700 }}>
          {weekLabel}
        </span>
        <button onClick={nextWeek} aria-label="Semana siguiente" style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.sm, color: colors.text[900],
          width: 36, height: 36, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          ›
        </button>
      </div>

      {/* 7-day cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map((day) => {
          const ymd = toYMD(day);
          const turno = getTurno(day);
          const isToday = ymd === todayYMD;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <div key={ymd} style={{
              background: isToday ? toneSoft(colors.primary.base, 10) : colors.bg[600],
              border: `1.5px solid ${isToday ? colors.primary.base : colors.border.subtle}`,
              borderRadius: radius.xl, padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: isWeekend && !turno ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: isToday ? colors.primary.base : colors.bg[400],
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 9, color: isToday ? '#fff' : colors.text[500], lineHeight: 1 }}>
                    {DAY_NAMES[day.getDay()]}
                  </span>
                  <span style={{ fontSize: 13, color: isToday ? '#fff' : colors.text[900], fontWeight: 800, lineHeight: 1 }}>
                    {day.getDate()}
                  </span>
                </div>
                <div>
                  {turno ? (
                    <>
                      <div style={{ color: colors.text[900], fontWeight: 700, fontSize: 13 }}>
                        {turno.horaInicio} → {turno.horaFin}
                      </div>
                      {turno.notas && (
                        <div style={{ color: colors.text[300], fontSize: 11, marginTop: 2 }}>
                          {turno.notas}
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ color: colors.text[300], fontSize: 12.5 }}>Sin turno</span>
                  )}
                </div>
              </div>

              {turno ? (
                <span style={{ background: toneSoft(tipoTone(turno.tipo), 14), color: tipoTone(turno.tipo), borderRadius: radius.pill, padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                  {turno.tipo}
                </span>
              ) : (
                <span style={{ background: toneSoft(colors.semantic.green, 12), color: colors.semantic.green, borderRadius: radius.pill, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                  Libre
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {turnos.length === 0 && (
        <div style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '32px 24px', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>
          No tienes turnos asignados esta semana
        </div>
      )}
    </div>
  );
}
