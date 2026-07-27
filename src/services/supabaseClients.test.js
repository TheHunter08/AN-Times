import { describe, expect, it, vi } from 'vitest'
import { AUTH_STORAGE_KEY, authSupabase, updatePassword } from './authService.js'
import { supabase as dataSupabase } from './dataService.js'

describe('aislamiento de clientes Supabase durante Fase 1', () => {
  it('Auth y datos usan instancias y almacenamientos de sesión diferentes', () => {
    expect(authSupabase).toBeTruthy()
    expect(dataSupabase).toBeTruthy()
    expect(authSupabase).not.toBe(dataSupabase)
    expect(authSupabase.auth.storageKey).toBe(AUTH_STORAGE_KEY)
    expect(AUTH_STORAGE_KEY).toBe('sb-fake-auth-token')
    expect(dataSupabase.auth.storageKey).toBe('times-inc-data-anon')
  })

  it('solo el cliente Auth persiste y refresca sesiones', () => {
    expect(authSupabase.auth.persistSession).toBe(true)
    expect(authSupabase.auth.autoRefreshToken).toBe(true)
    expect(dataSupabase.auth.persistSession).toBe(false)
    expect(dataSupabase.auth.autoRefreshToken).toBe(false)
  })

  it('Storage autenticado vive en el cliente Auth y los datos conservan Realtime propio', () => {
    expect(authSupabase.storage).toBeTruthy()
    expect(dataSupabase.realtime).toBeTruthy()
    expect(authSupabase.realtime).not.toBe(dataSupabase.realtime)
  })

  it('actualiza una contraseña válida y mantiene el mínimo de 8 caracteres', async () => {
    const updateUser = vi.spyOn(authSupabase.auth, 'updateUser').mockResolvedValue({ error:null })

    await expect(updatePassword('1234567')).rejects.toMatchObject({ message:'La contraseña debe tener al menos 8 caracteres' })
    await updatePassword('nueva-clave-segura')

    expect(updateUser).toHaveBeenCalledOnce()
    expect(updateUser).toHaveBeenCalledWith({ password:'nueva-clave-segura' })
    updateUser.mockRestore()
  })
})
