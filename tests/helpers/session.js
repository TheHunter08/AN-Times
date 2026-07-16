export const employee = {
  id: 'e1',
  name: 'Empleado Prueba',
  pin: '1111',
  pinLen: 4,
  color: '#7c3aed',
  initials: 'EP',
  empresa: 'TIMES INC',
  centroTrabajo: 'Obra Principal',
  role: 'encargado',
  startDate: '2024-01-01',
  onboardingDone: true,
  baja: false,
}

export function baseDB(extra = {}) {
  return {
    employees: [employee],
    records: [],
    vacaciones: [],
    gastos: [],
    notis: [],
    chats: [],
    cierres: [],
    obras: [],
    audit: [],
    config: {},
    ...extra,
  }
}

export async function seedLogin(page, extraDB = {}) {
  await page.route(/supabase\.co/i, route => route.abort())
  await page.addInitScript(({ db }) => {
    localStorage.clear()
    localStorage.setItem('an_times_v1', JSON.stringify(db))
    localStorage.setItem('an_times_privacy_v1', '1')
    localStorage.setItem('an_welcome_v1', '1')
  }, { db: baseDB(extraDB) })
}

export async function loginAsEmployee(page, extraDB = {}) {
  await page.route(/supabase\.co/i, route => route.abort())
  const db = baseDB(extraDB)
  const user = db.employees.find(item => item.id === employee.id) || employee
  await page.addInitScript(({ db, user }) => {
    localStorage.clear()
    localStorage.setItem('an_times_v1', JSON.stringify(db))
    localStorage.setItem('an_times_ses', JSON.stringify({
      user,
      isAdmin:false,
      isEnc:user.role === 'encargado' || !!user.isEnc,
      isJO:user.role === 'jefe_obra' || !!user.isJO,
    }))
    localStorage.setItem('an_times_privacy_v1', '1')
    localStorage.setItem('an_welcome_v1', '1')
  }, { db, user })
}

export async function loginAsAdmin(page, extraDB = {}) {
  await page.route(/supabase\.co/i, route => route.abort())
  await page.addInitScript(({ db }) => {
    localStorage.clear()
    localStorage.setItem('an_times_v1', JSON.stringify(db))
    localStorage.setItem('an_times_ses', JSON.stringify({ user: null, isAdmin: true, isEnc: false, isJO: false }))
    localStorage.setItem('an_times_privacy_v1', '1')
  }, { db: baseDB(extraDB) })
}
