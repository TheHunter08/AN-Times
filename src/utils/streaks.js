export function calcStreak(records, empId, todayDate) {
  const workedDays = new Set(
    (records || [])
      .filter(r => r.empId === empId && r.fin && (r.workSecs || 0) >= 1800)
      .map(r => r.inicio?.slice(0, 10))
      .filter(Boolean)
  )
  let count = 0
  const d = new Date(todayDate)
  if (!workedDays.has(todayDate)) {
    d.setDate(d.getDate() - 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  }
  while (count < 400) {
    const ds = d.toISOString().slice(0, 10)
    if (!workedDays.has(ds)) break
    count++
    d.setDate(d.getDate() - 1)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  }
  return count
}

export function calcWorkPattern(records, empId) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recs = (records || []).filter(r =>
    r.empId === empId && r.fin && r.inicio &&
    new Date(r.inicio).getTime() > cutoff &&
    (r.workSecs || 0) >= 3600
  )
  if (recs.length < 5) return null
  const entryMins = recs.map(r => { const d = new Date(r.inicio); return d.getHours() * 60 + d.getMinutes() }).sort((a, b) => a - b)
  const avg = Math.round(entryMins.reduce((a, b) => a + b, 0) / entryMins.length)
  const p20 = entryMins[Math.floor(entryMins.length * 0.2)]
  const p80 = entryMins[Math.floor(entryMins.length * 0.8)]
  const fm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { earlyStr: fm(p20), lateStr: fm(p80), avgMin: avg, sampleSize: recs.length }
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100]

export function streakLabel(n) {
  if (n === 0) return null
  const next = STREAK_MILESTONES.find(m => m > n)
  return next ? `${next - n} días para el hito 🏆` : '¡Racha épica! 🌟'
}
