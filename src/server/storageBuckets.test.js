import { describe, expect, it } from 'vitest'
import { isMissingStorageBucketResponse } from './storageBuckets.js'

describe('respuestas de buckets de Storage', () => {
  it('acepta los dos formatos que Supabase usa para un bucket inexistente', () => {
    expect(isMissingStorageBucketResponse(404, '')).toBe(true)
    expect(isMissingStorageBucketResponse(400, '{"statusCode":"404","message":"Bucket not found"}')).toBe(true)
  })

  it('no oculta errores reales de autenticación o validación', () => {
    expect(isMissingStorageBucketResponse(400, 'Invalid JWT')).toBe(false)
    expect(isMissingStorageBucketResponse(401, 'Bucket not found')).toBe(false)
    expect(isMissingStorageBucketResponse(500, 'Bucket not found')).toBe(false)
  })
})
