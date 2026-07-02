// ── Parte de trabajo dictado por voz ───────────────────────────────────────
// El encargado dicta en lenguaje natural al terminar el día y esto lo convierte
// en un parte estructurado (obra, incidencias, ausencias) sin teclear nada,
// y lo cruza con los fichajes reales para detectar discrepancias automáticamente.
import { today } from './time.js'

const AUSENCIA_KEYWORDS = ['no vino', 'no ha venido', 'falta', 'faltó', 'ausente', 'no se presentó', 'no apareció']
const INCIDENCIA_KEYWORDS = ['faltó', 'falta de', 'rotura', 'accidente', 'incidencia', 'problema', 'retraso', 'material', 'avería', 'averia', 'lluvia', 'parón', 'paron']
const SALIDA_KEYWORDS = ['se fue', 'salió', 'salio', 'marchó', 'marcho', 'abandonó', 'abandono']

// Busca nombres de empleados mencionados en el texto (por nombre o solo el primer nombre).
function findMentionedEmployees(text, employees) {
  const low = text.toLowerCase()
  const found = []
  for (const e of employees) {
    if (!e.name) continue
    const first = e.name.split(' ')[0].toLowerCase()
    if (first.length < 3) continue
    // Palabra completa, no substring de otra palabra
    const re = new RegExp(`\\b${first}\\b`, 'i')
    if (re.test(low)) found.push(e)
  }
  return found
}

// Divide el dictado en frases para poder asociar cada mención a su contexto inmediato.
function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

// Parser heurístico determinista — no depende de IA, funciona siempre offline.
export function parseParteHeuristico(text, db) {
  const employees = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const obras = db.obras || []
  const sentences = splitSentences(text)

  const ausencias = []
  const incidencias = []
  const salidasAnticipadas = []
  const seenAusente = new Set()
  const seenSalida = new Set()

  for (const s of sentences) {
    const low = s.toLowerCase()
    const mentioned = findMentionedEmployees(s, employees)

    if (AUSENCIA_KEYWORDS.some(k => low.includes(k))) {
      for (const e of mentioned) {
        if (seenAusente.has(e.id)) continue
        seenAusente.add(e.id)
        ausencias.push({ empId: e.id, empName: e.name, motivo: s })
      }
      if (!mentioned.length) incidencias.push(s)
    } else if (SALIDA_KEYWORDS.some(k => low.includes(k)) && mentioned.length) {
      for (const e of mentioned) {
        if (seenSalida.has(e.id)) continue
        seenSalida.add(e.id)
        salidasAnticipadas.push({ empId: e.id, empName: e.name, motivo: s })
      }
    } else if (INCIDENCIA_KEYWORDS.some(k => low.includes(k))) {
      incidencias.push(s)
    }
  }

  // Obra mencionada: la primera que aparezca por nombre en el texto
  const low = text.toLowerCase()
  const obra = obras.find(o => o.nombre && low.includes(o.nombre.toLowerCase()))

  return {
    obraId: obra?.id || null,
    obraNombre: obra?.nombre || null,
    ausencias,
    incidencias,
    salidasAnticipadas,
    resumen: sentences.length > ausencias.length + incidencias.length
      ? sentences.filter(s => !ausencias.some(a => a.motivo === s) && !incidencias.includes(s) && !salidasAnticipadas.some(sa => sa.motivo === s)).join(' ')
      : '',
  }
}

// Cruza el parte con los fichajes reales del día: si se dice que alguien faltó
// pero SÍ fichó, o viceversa, lo señala — para pillar errores de dictado o de fichaje.
export function crossCheckParte(parte, db, fecha = today()) {
  const ficharon = new Set((db.records || []).filter(r => r.inicio?.startsWith(fecha)).map(r => r.empId))
  const discrepancias = []
  for (const a of parte.ausencias) {
    if (ficharon.has(a.empId)) {
      discrepancias.push(`⚠️ Se dice que ${a.empName} faltó, pero SÍ tiene fichaje hoy — revisa el dictado o el fichaje.`)
    }
  }
  for (const sa of parte.salidasAnticipadas) {
    const rec = (db.records || []).find(r => r.empId === sa.empId && r.inicio?.startsWith(fecha))
    if (rec && !rec.fin) {
      discrepancias.push(`⚠️ Se dice que ${sa.empName} se fue antes, pero su jornada sigue abierta — probablemente falta fichar su salida.`)
    }
  }
  return discrepancias
}

export function buildParte({ text, db, autor, fecha = today() }) {
  const parsed = parseParteHeuristico(text, db)
  const discrepancias = crossCheckParte(parsed, db, fecha)
  return {
    id: `parte_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    fecha, autor,
    textoOriginal: text,
    ...parsed,
    discrepancias,
    createdAt: new Date().toISOString(),
  }
}
