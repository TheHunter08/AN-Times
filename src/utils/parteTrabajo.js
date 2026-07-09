// ── Parte de trabajo dictado por voz ───────────────────────────────────────
// El encargado dicta en lenguaje natural al terminar el día y esto lo convierte
// en un parte estructurado (obra, incidencias, ausencias) sin teclear nada,
// y lo cruza con los fichajes reales para detectar discrepancias automáticamente.
import { today, localDateStr } from './time.js'

// 'falta'/'faltó' NO van en esta lista de substrings: "falta de cemento/material/EPI…"
// (incidencia de obra) contiene "falta" igual que "Juan falta hoy" (ausencia) — con un
// simple includes() se colaba la primera en la segunda, marcando ausente al empleado que
// solo se menciona de pasada en una frase sobre falta de material. Se comprueban aparte
// con AUSENCIA_FALTA_RE, que excluye el caso "falta de".
const AUSENCIA_KEYWORDS = ['no vino', 'no ha venido', 'ausente', 'no se presentó', 'no apareció']
const AUSENCIA_FALTA_RE = /\bfalt\w*\b(?!\s+de\b)/i
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

// Agrupa por nombre de pila — si dos empleados comparten nombre ("Juan García" y
// "Juan Pérez"), una mención de "Juan" no permite saber a cuál se refiere el dictado.
function groupByFirstName(mentioned) {
  const groups = new Map()
  for (const e of mentioned) {
    const first = e.name.split(' ')[0].toLowerCase()
    if (!groups.has(first)) groups.set(first, [])
    groups.get(first).push(e)
  }
  return [...groups.values()]
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

  // Nombre ambiguo: si dos empleados comparten nombre de pila (frecuente en
  // plantillas de obra), no hay forma de saber a cuál se refiere el dictado —
  // en vez de marcar a ambos como ausentes/salida a ciegas, se deja como
  // incidencia para revisión manual.
  const flagAmbiguous = (group, s) =>
    incidencias.push(`⚠️ Nombre ambiguo ("${group[0].name.split(' ')[0]}": ${group.map(e => e.name).join(', ')}) — revisa manualmente: "${s}"`)

  for (const s of sentences) {
    const low = s.toLowerCase()
    const mentioned = findMentionedEmployees(s, employees)
    const groups = groupByFirstName(mentioned)
    // 'falta'/'faltó' se comprueban con AUSENCIA_FALTA_RE (excluye "falta de X",
    // que es una incidencia de material, no una ausencia) — ver comentario junto
    // a la constante.
    const isAusente = AUSENCIA_KEYWORDS.some(k => low.includes(k)) || AUSENCIA_FALTA_RE.test(s)

    if (isAusente) {
      for (const group of groups) {
        if (group.length > 1) { flagAmbiguous(group, s); continue }
        const e = group[0]
        if (seenAusente.has(e.id)) continue
        seenAusente.add(e.id)
        ausencias.push({ empId: e.id, empName: e.name, motivo: s })
      }
      if (!mentioned.length) incidencias.push(s)
    } else if (SALIDA_KEYWORDS.some(k => low.includes(k)) && mentioned.length) {
      for (const group of groups) {
        if (group.length > 1) { flagAmbiguous(group, s); continue }
        const e = group[0]
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

  // Antes se comparaba nº de FRASES contra nº de ENTRADAS de ausencia/incidencia
  // para decidir si merecía la pena calcular el resumen — pero una sola frase
  // puede generar varias entradas (varios empleados mencionados a la vez), así
  // que esa cuenta no reflejaba cuántas frases quedaban realmente sin clasificar
  // y podía perder frases sueltas del resumen en silencio. Se calcula siempre
  // directamente qué frases no quedaron capturadas en ninguna categoría.
  const resumen = sentences.filter(s =>
    !ausencias.some(a => a.motivo === s) &&
    !incidencias.includes(s) &&
    !salidasAnticipadas.some(sa => sa.motivo === s)
  ).join(' ')

  return {
    obraId: obra?.id || null,
    obraNombre: obra?.nombre || null,
    ausencias,
    incidencias,
    salidasAnticipadas,
    resumen,
  }
}

// Cruza el parte con los fichajes reales del día: si se dice que alguien faltó
// pero SÍ fichó, o viceversa, lo señala — para pillar errores de dictado o de fichaje.
export function crossCheckParte(parte, db, fecha = today()) {
  // localDateStr (no r.inicio?.startsWith(fecha)): inicio se guarda en UTC,
  // fecha es local — un fichaje de madrugada no se detectaba como "ya fichó",
  // dejando pasar contradicciones reales entre el parte dictado y los fichajes.
  const ficharon = new Set((db.records || []).filter(r => r.inicio && localDateStr(new Date(r.inicio)) === fecha).map(r => r.empId))
  const discrepancias = []
  for (const a of parte.ausencias) {
    if (ficharon.has(a.empId)) {
      discrepancias.push(`⚠️ Se dice que ${a.empName} faltó, pero SÍ tiene fichaje hoy — revisa el dictado o el fichaje.`)
    }
  }
  for (const sa of parte.salidasAnticipadas) {
    const rec = (db.records || []).find(r => r.empId === sa.empId && r.inicio && localDateStr(new Date(r.inicio)) === fecha)
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
