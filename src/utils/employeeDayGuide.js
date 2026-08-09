const p2 = value => String(value).padStart(2, '0')

const clock = date => `${p2(date.getHours())}:${p2(date.getMinutes())}`

export function buildEmployeeDayGuide({
  state = 'idle',
  now = new Date(),
  remainingMin = 0,
  progressPct = 0,
  shiftStart = '',
  shiftEnd = '',
  syncStatus = 'synced',
} = {}) {
  const safeRemaining = Math.max(0, Number.isFinite(remainingMin) ? Math.round(remainingMin) : 0)
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progressPct) ? Math.round(progressPct) : 0))

  if (syncStatus === 'error') {
    return {
      tone:'orange',
      label:'Protección offline',
      title:'Tus cambios siguen seguros',
      detail:'Se guardan en este dispositivo y se enviarán automáticamente al recuperar conexión.',
      metric:'Offline',
      metricLabel:'sin pérdida de datos',
    }
  }

  if (state === 'idle') {
    return {
      tone:'primary',
      label:'Siguiente paso',
      title:shiftStart ? `Tu turno está previsto a las ${shiftStart}` : 'Todo listo para tu próxima jornada',
      detail:shiftEnd ? `Horario planificado: ${shiftStart || '—'}–${shiftEnd}. Inicia cuando estés en tu centro de trabajo.` : 'Cuando estés en tu centro, inicia la jornada desde el control principal.',
      metric:shiftStart || 'Listo',
      metricLabel:shiftStart ? 'inicio previsto' : 'para comenzar',
    }
  }

  if (safeRemaining === 0 || safeProgress >= 100) {
    return {
      tone:'green',
      label:'Objetivo alcanzado',
      title:'Has completado tu objetivo diario',
      detail:'Revisa el tiempo registrado antes de finalizar la jornada.',
      metric:'100%',
      metricLabel:'objetivo diario',
    }
  }

  const projectedAt = new Date(now.getTime() + safeRemaining * 60000)
  const isBreak = state === 'break'
  return {
    tone:isBreak ? 'orange' : 'green',
    label:isBreak ? 'Proyección al reanudar' : 'Proyección en vivo',
    title:isBreak ? `Si reanudas ahora, llegarás al objetivo sobre las ${clock(projectedAt)}` : `Al ritmo actual, llegarás al objetivo sobre las ${clock(projectedAt)}`,
    detail:`Te quedan ${Math.floor(safeRemaining / 60)} h ${p2(safeRemaining % 60)} min de trabajo efectivo. La estimación se actualiza cada minuto.`,
    metric:clock(projectedAt),
    metricLabel:'hora estimada',
  }
}
