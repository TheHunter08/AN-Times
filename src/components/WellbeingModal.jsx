import { useState } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y.js';

const colors = {
  bg: { 600: 'var(--bg-card)', 400: 'var(--bg-card-hover)' },
  primary: { base: 'var(--brand-500)', light: 'var(--brand-400)' },
  text: { 900: 'var(--text-primary)', 500: 'var(--text-tertiary)', 300: 'var(--text-disabled)' },
  border: { subtle: 'var(--border-subtle)', default: 'var(--border-default)' },
};
const radius = { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)' };
const toneSoft = (color, amount = 14) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

const MOODS = [
  { emoji: '😴', label: 'Cansado', value: 'cansado' },
  { emoji: '🙂', label: 'Normal',  value: 'normal'  },
  { emoji: '😊', label: 'Bien',    value: 'bien'    },
  { emoji: '🔥', label: 'Genial',  value: 'genial'  },
  { emoji: '😤', label: 'Estresado', value: 'estresado' },
];

export default function WellbeingModal({ visible, onClose, onSubmit, userName }) {
  const [selected, setSelected] = useState(null);
  const [nota, setNota] = useState('');
  const dialogRef = useDialogA11y(visible, onClose);

  if (!visible) return null;

  function handleSubmit() {
    if (!selected) return;
    onSubmit({ mood: selected, nota: nota.trim() });
    onClose();
    setSelected(null);
    setNota('');
  }

  function handleSkip() {
    onClose();
    setSelected(null);
    setNota('');
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      padding: 16,
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wellbeing-dialog-title"
        tabIndex={-1}
        style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius['2xl'],
          padding: '28px 24px 24px', width: '100%', maxWidth: 400,
          boxShadow: '0 24px 60px rgba(0,0,0,.5)',
          animation: 'wbSlideIn .22s cubic-bezier(.34,1.56,.64,1) both',
        }}
      >
        <style>{`
          @keyframes wbSlideIn {
            from { opacity: 0; transform: scale(0.9) translateY(12px); }
            to   { opacity: 1; transform: scale(1)   translateY(0); }
          }
        `}</style>

        <h2 id="wellbeing-dialog-title" style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: colors.text[900], textAlign: 'center' }}>
          ¿Cómo llegas hoy{userName ? `, ${userName.split(' ')[0]}` : ''}?
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: colors.text[500], textAlign: 'center' }}>
          Cuéntanos tu estado de ánimo al empezar la jornada
        </p>

        {/* Mood buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 20 }}>
          {MOODS.map((m) => {
            const isSelected = selected === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setSelected(m.value)}
                type="button"
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: isSelected ? toneSoft(colors.primary.base, 15) : colors.bg[400],
                  border: `2px solid ${isSelected ? colors.primary.base : 'transparent'}`,
                  borderRadius: radius.md, padding: '10px 4px', cursor: 'pointer',
                  transition: 'all .15s ease', outline: 'none', fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{m.emoji}</span>
                <span style={{ fontSize: 10.5, color: isSelected ? colors.primary.light : colors.text[500], fontWeight: isSelected ? 700 : 500, whiteSpace: 'nowrap' }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Optional note */}
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="¿Algo que quieras comentar? (opcional)"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', background: colors.bg[400],
            border: `1px solid ${colors.border.default}`, borderRadius: radius.md,
            color: colors.text[900], fontSize: 13, padding: '10px 12px', resize: 'none',
            outline: 'none', marginBottom: 16, fontFamily: 'inherit',
          }}
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selected}
          type="button"
          style={{
            width: '100%', padding: 13, borderRadius: radius.md, border: 'none',
            background: selected ? 'var(--gradient-brand)' : colors.bg[400],
            color: selected ? '#fff' : colors.text[300],
            fontWeight: 700, fontSize: 15, cursor: selected ? 'pointer' : 'not-allowed',
            transition: 'opacity .2s', marginBottom: 12, fontFamily: 'inherit',
          }}
        >
          Continuar →
        </button>

        {/* Skip */}
        <p style={{ textAlign: 'center', margin: 0 }}>
          <button onClick={handleSkip} type="button" style={{ background: 'none', border: 'none', color: colors.text[300], fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
            Omitir
          </button>
        </p>
      </div>
    </div>
  );
}
