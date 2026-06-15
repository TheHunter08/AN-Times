import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore.js'
import { calcSecs, today } from '../utils/time.js'

export function useTimer() {
  const { db, session, timer, updateTimer, saveDB } = useAppStore()
  const tickRef = useRef(0)
  const saveTickRef = useRef(null)

  useEffect(() => {
    if (!session.user) return

    const interval = setInterval(() => {
      const openRec = db.records.find(r => r.empId === session.user.id && !r.fin)
      if (!openRec) {
        if (timer.state !== 'idle') updateTimer({ state: 'idle', ws: 0, bs: 0 })
        return
      }

      const state = openRec.enDescanso ? 'break' : 'working'
      const t = calcSecs(openRec)
      updateTimer({ state, ws: t.work, bs: t.brk })

      // Persist every 30 ticks (~30s)
      if ((++tickRef.current) % 30 === 0) {
        openRec.workSecs = t.work
        openRec.breakSecs = t.brk
        clearTimeout(saveTickRef.current)
        saveTickRef.current = setTimeout(() => {
          saveDB({ records: [...db.records] })
        }, 5000)
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      clearTimeout(saveTickRef.current)
    }
  }, [db, session.user])

  return timer
}
