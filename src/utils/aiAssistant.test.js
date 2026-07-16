import { describe, expect, it } from 'vitest'
import { aiAnswer, buildAIContext, buildWorksiteInsights, getAIChips } from './aiAssistant.js'

const admin = { id:'admin', name:'Ana Admin', role:'admin', isAdmin:true }
const staleStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
const db = {
  employees:[admin, { id:'e1', name:'Empleado Uno' }],
  records:[{ id:'r1', empId:'e1', inicio:staleStart, fin:null }],
  cierres:[{ id:'c1', firmaAdmin:false }],
  vacaciones:[],
}

describe('Times AI operativo', () => {
  it('incorpora riesgos reales al contexto de supervisión', () => {
    const context = buildAIContext(db, admin)
    expect(context).toContain('Cumplimiento documental:')
    expect(context).toContain('Jornadas sin finalizar')
  })

  it('responde con prioridades de cumplimiento sin inventar datos', () => {
    const answer = aiAnswer('Riesgos de cumplimiento', db, admin)
    expect(answer).toContain('Índice documental')
    expect(answer).toContain('Jornadas sin finalizar: 1')
    expect(answer).toContain('Cierres pendientes de firma: 1')
  })

  it('no revela el directorio de empleados a un usuario normal', () => {
    const answer = aiAnswer('¿Quién olvidó fichar?', db, { id:'e1', name:'Empleado Uno', role:'empleado' })
    expect(answer).toContain('Solo administradores y responsables')
    expect(answer).not.toContain('Ana Admin')
    expect(getAIChips({ role:'empleado' })).not.toContain('¿Quién olvidó fichar?')
  })

  it('limita la respuesta del encargado a su centro y obra', () => {
    const manager = { id:'boss', name:'Responsable', role:'encargado', centroTrabajo:'Centro Norte', obrasAsignadas:['obra-a'] }
    const scopedDb = {
      employees:[
        { id:'a', name:'Ana Norte', centroTrabajo:'Centro Norte', obrasAsignadas:['obra-a'] },
        { id:'b', name:'Bea Otra', centroTrabajo:'Centro Norte', obrasAsignadas:['obra-b'] },
      ],
      obras:[{ id:'obra-a', nombre:'Obra A' }, { id:'obra-b', nombre:'Obra B' }],
      records:[], vacaciones:[], cierres:[], gastos:[], documentos:[],
    }
    const answer = aiAnswer('¿Quién olvidó fichar?', scopedDb, manager)
    expect(answer).toContain('Ana Norte')
    expect(answer).not.toContain('Bea Otra')
  })

  it('resume actividad por obra usando el centro real de cada fichaje', () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0)
    const workDb = {
      employees:[{ id:'e1', name:'Uno', obrasAsignadas:['obra-a', 'obra-b'] }],
      obras:[{ id:'obra-a', nombre:'Obra A' }, { id:'obra-b', nombre:'Obra B' }],
      records:[
        { id:'closed', empId:'e1', inicio:start.toISOString(), fin:end.toISOString(), centro:'Obra A', breaks:[] },
        { id:'open', empId:'e1', inicio:start.toISOString(), fin:null, centro:'Obra B', breaks:[] },
      ],
    }
    const insights = buildWorksiteInsights(workDb, admin, now)
    expect(insights.works.find(work => work.id === 'obra-a')).toMatchObject({ workedMin:120, activeNow:0 })
    expect(insights.works.find(work => work.id === 'obra-b')).toMatchObject({ workedMin:0, activeNow:1 })
    expect(aiAnswer('Estado de las obras', workDb, admin)).toContain('Obra B: 1 trabajando')
  })

  it('explica el estado de sincronización sin prometer una subida inexistente', () => {
    const answer = aiAnswer('¿Mis datos están sincronizados?', {
      ...db,
      _runtimeSync:{ syncStatus:'offline', offlinePending:true, syncError:null },
    }, { id:'e1', name:'Empleado Uno', role:'empleado' })
    expect(answer).toContain('cambios pendientes de subir')
    expect(answer).toContain('guardados en este dispositivo')
  })
})
