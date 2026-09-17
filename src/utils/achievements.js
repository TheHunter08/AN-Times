import { calcMin, p2, localDateStr } from './time.js'

export function localMonthKey(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}` }

export function workdaysSoFarInMonth(mk, ref = new Date()) {
  const [y, m] = mk.split('-').map(Number)
  let n = 0
  const d = new Date(y, m - 1, 1)
  while (d <= ref) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

export const ACHIEVEMENTS = [
  { id:'a1', icon:'🌱', title:'Primera jornada', desc:'Primera jornada completada', check:(r)=>r.filter(x=>x.fin).length>=1 },
  { id:'a2', icon:'⚡', title:'Tres en raya', desc:'3 días consecutivos', check:(r,s)=>s>=3 },
  { id:'a3', icon:'🔥', title:'Semana de fuego', desc:'7 días seguidos', check:(r,s)=>s>=7 },
  { id:'a4', icon:'🌟', title:'Mes imparable', desc:'30 días seguidos', check:(r,s)=>s>=30 },
  // localDateStr(new Date(x.inicio)) (no x.inicio.slice(0,10)/slice(0,7)/startsWith(mk)):
  // inicio se guarda en UTC — un fichaje nocturno se atribuía al día/mes siguiente en UTC
  // en vez del día/mes local real, falseando rachas y logros.
  { id:'a5', icon:'📅', title:'50 jornadas', desc:'50 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>localDateStr(new Date(x.inicio)))).size>=50 },
  { id:'a6', icon:'💯', title:'100 jornadas', desc:'100 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>localDateStr(new Date(x.inicio)))).size>=100 },
  { id:'a7', icon:'🏅', title:'Ultramaratón', desc:'10h en un solo día', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const d=localDateStr(new Date(x.inicio));m[d]=(m[d]||0)+calcMin(x)});return Object.values(m).some(v=>v>=600)} },
  { id:'a8', icon:'💪', title:'Centurión', desc:'100h en un mes', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const k=localDateStr(new Date(x.inicio)).slice(0,7);m[k]=(m[k]||0)+calcMin(x)});return Object.values(m).some(v=>v>=6000)} },
  { id:'a9', icon:'⏰', title:'Siempre puntual', desc:'5 días antes de las 09:30', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=570}).length>=5 },
  { id:'a10', icon:'🌅', title:'Madrugador', desc:'3 veces antes de las 08:00', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=480}).length>=3 },
  { id:'a11', icon:'🎯', title:'Cero olvidos', desc:'Ningún fichaje cerrado automáticamente este mes', check:(r)=>{
    const mk = localMonthKey()
    const monthRecs = r.filter(x=>x.inicio && localDateStr(new Date(x.inicio)).startsWith(mk))
    return monthRecs.length>0 && !monthRecs.some(x=>x.autoClosedAt)
  } },
  { id:'a12', icon:'📆', title:'Mes perfecto', desc:'Todos los días laborables fichados este mes, sin olvidos', check:(r)=>{
    const mk = localMonthKey()
    const expected = workdaysSoFarInMonth(mk)
    const monthRecs = r.filter(x=>x.inicio && localDateStr(new Date(x.inicio)).startsWith(mk))
    const workedDays = new Set(monthRecs.filter(x=>x.fin&&calcMin(x)>=30).map(x=>localDateStr(new Date(x.inicio)))).size
    return expected>=5 && workedDays>=expected && monthRecs.length>0 && !monthRecs.some(x=>x.autoClosedAt)
  } },
]

// IDs de logros que cumplen sus condiciones ahora mismo, evaluados en vivo
// contra el historial actual (records/streak) — no incluye los ya persistidos
// en employee.achievements, eso lo resuelve el llamador (ver
// AchievementsSection.jsx y EmployeePage.jsx: unlockedIds = union(persisted, live)).
export function liveUnlockedIds(records, streak) {
  return ACHIEVEMENTS.filter(a => a.check(records, streak)).map(a => a.id)
}
