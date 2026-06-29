import { useState, useEffect } from 'react';

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

function tipoBadgeStyle(tipo) {
  if (tipo === 'guardia') return { background: 'rgba(245,158,11,.15)', color: '#f59e0b' };
  if (tipo === 'libre')   return { background: 'rgba(34,197,94,.15)',  color: 'var(--green)' };
  return                          { background: 'rgba(99,102,241,.15)', color: 'var(--primary-light)' };
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
    <div style={{ padding: '16px', paddingBottom: '32px' }}>
      {/* Upcoming shifts */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3
            style={{
              margin: '0 0 10px',
              fontSize: '.8rem',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: 'var(--text3)',
              fontWeight: 600,
            }}
          >
            Próximos turnos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcoming.map((t) => {
              const d = new Date(t.fecha + 'T00:00:00');
              return (
                <div
                  key={t.id}
                  style={{
                    background: 'var(--bg-800)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: t.fecha === todayYMD ? '1px solid var(--primary)' : '1px solid transparent',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text1)', fontWeight: 600, fontSize: '.95rem' }}>
                      {DAY_NAMES_FULL[d.getDay()]}
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: '.85rem', marginLeft: '8px' }}>
                      {formatDateLabel(d)}
                    </span>
                    {t.fecha === todayYMD && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '.7rem',
                          background: 'var(--primary)',
                          color: '#fff',
                          borderRadius: '6px',
                          padding: '1px 6px',
                          fontWeight: 600,
                        }}
                      >
                        HOY
                      </span>
                    )}
                  </div>
                  <span style={{ color: 'var(--text1)', fontSize: '.9rem', fontWeight: 500 }}>
                    {t.horaInicio} → {t.horaFin}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <button
          onClick={prevWeek}
          style={{
            background: 'var(--bg-800)',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text1)',
            width: '36px',
            height: '36px',
            fontSize: '1.1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ‹
        </button>
        <span style={{ color: 'var(--text3)', fontSize: '.85rem', fontWeight: 500 }}>
          {weekLabel}
        </span>
        <button
          onClick={nextWeek}
          style={{
            background: 'var(--bg-800)',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text1)',
            width: '36px',
            height: '36px',
            fontSize: '1.1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ›
        </button>
      </div>

      {/* 7-day cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {days.map((day) => {
          const ymd = toYMD(day);
          const turno = getTurno(day);
          const isToday = ymd === todayYMD;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <div
              key={ymd}
              style={{
                background: isToday ? 'rgba(99,102,241,.12)' : 'var(--bg-800)',
                border: isToday ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: isWeekend && !turno ? 0.55 : 1,
              }}
            >
              {/* Left: day + date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: isToday ? 'var(--primary)' : 'var(--bg-700)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: '.6rem', color: isToday ? '#fff' : 'var(--text3)', lineHeight: 1 }}>
                    {DAY_NAMES[day.getDay()]}
                  </span>
                  <span style={{ fontSize: '.85rem', color: isToday ? '#fff' : 'var(--text1)', fontWeight: 700, lineHeight: 1 }}>
                    {day.getDate()}
                  </span>
                </div>
                <div>
                  {turno ? (
                    <>
                      <div style={{ color: 'var(--text1)', fontWeight: 600, fontSize: '.9rem' }}>
                        {turno.horaInicio} → {turno.horaFin}
                      </div>
                      {turno.notas && (
                        <div style={{ color: 'var(--text4)', fontSize: '.75rem', marginTop: '2px' }}>
                          {turno.notas}
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ color: 'var(--text4)', fontSize: '.85rem' }}>Sin turno</span>
                  )}
                </div>
              </div>

              {/* Right: badge */}
              {turno ? (
                <span
                  style={{
                    ...tipoBadgeStyle(turno.tipo),
                    borderRadius: '8px',
                    padding: '3px 10px',
                    fontSize: '.75rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {turno.tipo}
                </span>
              ) : (
                <span
                  style={{
                    background: 'rgba(34,197,94,.12)',
                    color: 'var(--green)',
                    borderRadius: '8px',
                    padding: '3px 10px',
                    fontSize: '.75rem',
                    fontWeight: 600,
                  }}
                >
                  Libre
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {turnos.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            color: 'var(--text4)',
            marginTop: '24px',
            fontSize: '.9rem',
          }}
        >
          No tienes turnos asignados esta semana
        </div>
      )}
    </div>
  );
}
