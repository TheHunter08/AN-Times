export const DB_URL = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app/an_times_data'
export const FB_BASE = 'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app'
export const ADMIN_PIN = '0824'
export const VAPID_PUB = 'BJLsu9gt57Oa3uflEpMVUfRXgawp49vhtgdMjU6nzb9zOjWgSxIxuuFQVe6z_uiNXNPUwbCPqUHUoZk_iVmjNfQ'

export const WK = 40 * 60   // weekly minutes norm
export const WD = 8 * 60    // daily minutes norm
export const WM = 160 * 60  // monthly minutes norm
export const VPM = 2.5      // vacation days per month

export const FB_CONFIG = {
  apiKey:            'AIzaSyAYZdHMrGBnBb5O6p5oBIuikX1Qc9HgvjQ',
  authDomain:        'times-inc.firebaseapp.com',
  databaseURL:       'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'times-inc',
  storageBucket:     'times-inc.firebasestorage.app',
  messagingSenderId: '366356529016',
  appId:             '1:366356529016:web:ffe5ba97c214c21fc9928d'
}

export const INITIAL_DB = {
  empresas: ['Soluciones Mata'],
  obras: ['Soluciones Mata'],
  centrosTrabajo: ['Obra Principal', 'Oficina Central', 'Almacén'],
  employees: [
    { id: 'admin', name: 'Administrador', empresa: 'Soluciones Mata', pin: ADMIN_PIN, color: '#5aa9e6', initials: 'AD', startDate: '2024-01-01', email: '', isAdmin: true },
    { id: 'e1', name: 'Ismael Angeles de la Cruz', empresa: 'Soluciones Mata', centroTrabajo: 'Obra Principal', pin: '1111', color: '#6366f1', initials: 'IA', startDate: '2024-01-01', email: '', role: 'encargado', obrasAsignadas: ['Soluciones Mata'] },
    { id: 'e2', name: 'Franklin Lisandro Nuñez Roque', empresa: 'Soluciones Mata', centroTrabajo: 'Obra Principal', pin: '2222', color: '#10b981', initials: 'FL', startDate: '2024-01-01', email: '', role: 'empleado', obrasAsignadas: [] }
  ],
  records: [],
  vacaciones: [],
  medicos: [],
  ausencias: [],
  mensajes: [],
  notis: [],
  cierres: [],
  monthSnapshots: {},
  firmas: {},
  _ts: 0
}
