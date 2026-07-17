// Datos y acciones del tab "Vacaciones" — misma lógica que TabVacaciones.jsx
// (legacy), relocalizada sin cambios de negocio.
import { useMemo, useCallback } from 'react'
import { today } from '../../utils/time.js'

export function useVacacionesData(db: any, u: any, vac: any, toast: (msg: string, ms?: number, kind?: string) => void, saveDB: (updater: any) => void, showConfirm: (msg: string, onConfirm: () => void) => void) {
  const myVacs = useMemo(
    () => (db.vacaciones || []).filter((v: any) => v.empId === u.id).sort((a: any, b: any) => +new Date(b.fechaInicio || 0) - +new Date(a.fechaInicio || 0)),
    [db.vacaciones, u.id]
  )

  const cancelVac = useCallback((id: string) => {
    showConfirm('¿Cancelar esta solicitud de vacaciones?', () => {
      saveDB((freshDb: any) => ({ vacaciones: (freshDb.vacaciones || []).filter((v: any) => v.id !== id || v.estado !== 'pendiente') }))
      toast('Solicitud cancelada', 3000, 'warn')
    })
  }, [saveDB, toast, showConfirm])

  const downloadVacICS = useCallback((v: any) => {
    const dtFin = new Date(v.fechaFin + 'T00:00:00')
    dtFin.setDate(dtFin.getDate() + 1)
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TIMES INC//ES', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:vac-${v.id}@times-inc`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${v.fechaInicio.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${dtFin.toISOString().slice(0, 10).replace(/-/g, '')}`,
      `SUMMARY:Vacaciones ${u.name.split(' ')[0]}`,
      `DESCRIPTION:${v.dias} días de vacaciones aprobadas`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Vacaciones mañana', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vacaciones-${v.fechaInicio}.ics`; a.click()
    URL.revokeObjectURL(url)
    toast('Archivo .ics descargado — ábrelo para añadir al calendario', 3000, 'ok')
  }, [u.name, toast])

  const pct = vac.generated > 0 ? Math.round((vac.used / vac.generated) * 100) : 0
  const todayVacStr = today()
  const daysFrom = useCallback((ds: string) => Math.ceil((+new Date(ds + 'T00:00:00') - +new Date(todayVacStr + 'T00:00:00')) / 86400000), [todayVacStr])

  return { myVacs, cancelVac, downloadVacICS, pct, daysFrom }
}
