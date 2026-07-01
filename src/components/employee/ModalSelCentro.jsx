import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'

export function ModalSelCentro({ visible, data, onConfirm, onClose }) {
  const [sel, setSel] = useState('')
  useEffect(() => { if (data?.current) setSel(data.current) }, [data])
  useModalBack(visible, onClose)
  if (!visible) return null
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <h2>📍 Seleccionar centro de trabajo</h2>
        <div className="field">
          <label>Centro</label>
          <select value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">— Selecciona —</option>
            {(data?.centros || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="modal-btns">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(sel)}>Iniciar jornada</button>
        </div>
      </div>
    </div>
  )
}
