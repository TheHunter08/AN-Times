import { describe, expect, it, vi } from 'vitest'
import { readAllRestRows } from '../../scripts/read-all-rest-rows.mjs'

describe('readAllRestRows', () => {
  it('pagina hasta recuperar también las filas posteriores al límite de PostgREST', async () => {
    const pages = [
      [{ id:'1' }, { id:'2' }],
      [{ id:'3' }, { id:'4' }],
      [{ id:'5' }],
    ]
    const fetchImpl = vi.fn(async () => ({
      ok:true,
      json:async () => pages.shift(),
      text:async () => '',
    }))

    const rows = await readAllRestRows({
      baseUrl:'https://project.test/',
      path:'app_entities?select=id&order=id.asc',
      headers:{ apikey:'test' },
      pageSize:2,
      fetchImpl,
    })

    expect(rows.map(row => row.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(fetchImpl.mock.calls.map(([, options]) => options.headers.Range)).toEqual(['0-1', '2-3', '4-5'])
  })

  it('falla de forma visible si PostgREST no devuelve una lista', async () => {
    const fetchImpl = vi.fn(async () => ({ ok:true, json:async () => ({ error:'unexpected' }), text:async () => '' }))
    await expect(readAllRestRows({ baseUrl:'https://project.test', path:'app_entities?select=id', fetchImpl }))
      .rejects.toThrow('no devolvió una lista')
  })
})
