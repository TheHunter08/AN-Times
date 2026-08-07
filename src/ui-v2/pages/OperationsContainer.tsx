import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { getPushCoverage, uploadPendingIfAny } from '../../services/dataService.js'
import { isValidAccountEmail, normalizeAccountEmail } from '../../utils/authRegistration.js'
import { getLaunchBlockers } from '../../utils/launchRequirements.js'
import { buildComplianceSummary } from '../../utils/complianceSummary.js'
import { pendingValidationRecords } from '../../utils/recordValidation.js'
import { Operations } from './Operations.js'

export default function OperationsContainer({ onNavigate, onReviewEmployee }: { onNavigate: (page: string) => void; onReviewEmployee: (employeeId: string) => void }) {
  const db = useAppStore(s => s.db) as any
  const saveDB = useAppStore(s => s.saveDB)
  const toast = useAppStore(s => s.toast)
  const syncStatus = useAppStore(s => s.syncStatus)
  const syncError = useAppStore(s => s.syncError)
  const offlinePending = useAppStore(s => s.offlinePending)
  const realtimeStatus = useAppStore(s => s.realtimeStatus)
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const fetchDB = useAppStore(s => s.fetchDB)
  const schedules = db.config?.reportSchedules || []
  const defaultWidgets = ['employees', 'working', 'break', 'absent', 'hoursToday']
  const legacyWidgetIds: Record<string, string> = { validation:'break', requests:'absent', coverage:'hoursToday' }
  const visibleWidgets = (db.config?.adminDashboard?.visibleWidgets || defaultWidgets).map((id: string) => legacyWidgetIds[id] || id)
  const employees = (db.employees || []).filter((employee: any) => !employee.baja)
  const workers = employees.filter((employee: any) => employee.role !== 'admin' && !employee.isAdmin)
  const authReady = employees.filter((employee: any) => employee.auth_id || employee.authId).length
  const emailReady = employees.filter((employee: any) => isValidAccountEmail(employee.email)).length
  const emailCounts = new Map<string, number>()
  const authCounts = new Map<string, number>()
  employees.forEach((employee: any) => {
    if (isValidAccountEmail(employee.email)) {
      const email = normalizeAccountEmail(employee.email)
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
    }
    const authId = employee.auth_id || employee.authId
    if (authId) authCounts.set(String(authId), (authCounts.get(String(authId)) || 0) + 1)
  })
  const duplicatedEmails = [...emailCounts.values()].filter(count => count > 1).length
  const duplicatedAuthIds = [...authCounts.values()].filter(count => count > 1).length
  const signatureReady = workers.filter((employee: any) => Boolean(db.firmas?.[employee.id]?.main?.data)).length
  const pendingValidation = pendingValidationRecords(db.records).length
  const compliance = buildComplianceSummary(db)
  const [pushReady, setPushReady] = useState<number | null>(null)
  const [pushMissingIds, setPushMissingIds] = useState<string[]>([])
  const [pushCoverageState, setPushCoverageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pushCoverageRequest, setPushCoverageRequest] = useState(0)
  const workerIdsKey = workers.map((employee: any) => employee.id).sort().join('|')

  useEffect(() => {
    let active = true
    setPushCoverageState('loading')
    getPushCoverage(workerIdsKey ? workerIdsKey.split('|') : []).then(result => {
      if (!active) return
      setPushReady(result.registered)
      setPushMissingIds(result.missingIds || [])
      setPushCoverageState(result.registered == null ? 'error' : 'ready')
    })
    return () => { active = false }
  }, [workerIdsKey, pushCoverageRequest])

  const updateConfig = (patch: any) => saveDB((fresh: any) => ({
    config:{ ...(fresh.config || {}), ...patch, _upd:new Date().toISOString() },
  }))

  const onSync = async () => {
    await uploadPendingIfAny()
    await fetchDB()
    setPushCoverageRequest(value => value + 1)
    toast('Sincronización comprobada', 2200, 'ok')
  }

  return <Operations
    syncStatus={syncStatus} syncError={syncError} offlinePending={offlinePending}
    realtimeStatus={realtimeStatus} lastSyncTime={lastSyncTime}
    authReady={authReady} authTotal={employees.length} emailReady={emailReady}
    duplicatedEmails={duplicatedEmails} duplicatedAuthIds={duplicatedAuthIds}
    signatureReady={signatureReady} signatureTotal={workers.length}
    pushReady={pushReady} pushTotal={workers.length} pushCoverageState={pushCoverageState}
    pendingValidation={pendingValidation} staleOpenShifts={compliance.incompleteRecords}
    pendingClosures={compliance.closures - compliance.signedClosures}
    documentCount={(db.documentos || []).length}
    launchBlockers={getLaunchBlockers(db, pushMissingIds)} schedules={schedules}
    automationHealth={db.config?.automationHealth || {}} migrationVerification={db.config?.migrationVerification || {}}
    visibleWidgets={visibleWidgets} onSync={onSync}
    onRetryPushCoverage={() => setPushCoverageRequest(value => value + 1)}
    onSaveSchedule={(schedule: any) => { updateConfig({ reportSchedules:[...schedules, schedule] }); toast('Programación guardada', 2200, 'ok') }}
    onToggleSchedule={(id: string) => updateConfig({ reportSchedules:schedules.map((schedule: any) => schedule.id === id ? { ...schedule, enabled:!schedule.enabled, _upd:new Date().toISOString() } : schedule) })}
    onDeleteSchedule={(id: string) => updateConfig({ reportSchedules:schedules.filter((schedule: any) => schedule.id !== id) })}
    onChangeWidgets={(ids: string[]) => updateConfig({ adminDashboard:{ ...(db.config?.adminDashboard || {}), visibleWidgets:ids } })}
    onNavigate={onNavigate} onReviewEmployee={onReviewEmployee}
  />
}
