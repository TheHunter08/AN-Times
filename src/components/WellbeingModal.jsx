import { useState } from 'react';

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-800)',
          borderRadius: '20px',
          padding: '28px 24px 24px',
          width: '100%',
          maxWidth: '400px',
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

        {/* Header */}
        <h2
          style={{
            margin: '0 0 6px',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--text1)',
            textAlign: 'center',
          }}
        >
          ¿Cómo llegas hoy{userName ? `, ${userName.split(' ')[0]}` : ''}?
        </h2>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: '.85rem',
            color: 'var(--text3)',
            textAlign: 'center',
          }}
        >
          Cuéntanos tu estado de ánimo al empezar la jornada
        </p>

        {/* Mood buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          {MOODS.map((m) => {
            const isSelected = selected === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setSelected(m.value)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  background: isSelected ? 'rgba(99,102,241,.15)' : 'var(--bg-700)',
                  border: isSelected
                    ? '2px solid var(--primary)'
                    : '2px solid transparent',
                  borderRadius: '12px',
                  padding: '10px 4px',
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                  outline: 'none',
                }}
              >
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{m.emoji}</span>
                <span
                  style={{
                    fontSize: '.65rem',
                    color: isSelected ? 'var(--primary-light)' : 'var(--text3)',
                    fontWeight: isSelected ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}
                >
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
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg-700)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: '10px',
            color: 'var(--text1)',
            fontSize: '.9rem',
            padding: '10px 12px',
            resize: 'none',
            outline: 'none',
            marginBottom: '16px',
            fontFamily: 'inherit',
          }}
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selected}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '12px',
            border: 'none',
            background: selected ? 'var(--primary)' : 'var(--bg-700)',
            color: selected ? '#fff' : 'var(--text4)',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: selected ? 'pointer' : 'not-allowed',
            transition: 'background .2s',
            marginBottom: '12px',
          }}
        >
          Continuar →
        </button>

        {/* Skip */}
        <p
          style={{
            textAlign: 'center',
            margin: 0,
          }}
        >
          <button
            onClick={handleSkip}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text4)',
              fontSize: '.85rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Omitir
          </button>
        </p>
      </div>
    </div>
  );
}
