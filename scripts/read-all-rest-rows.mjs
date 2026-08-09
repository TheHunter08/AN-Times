export async function readAllRestRows({ baseUrl, path, headers = {}, pageSize = 1000, fetchImpl = fetch }) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/rest/v1/${path}`, {
      headers:{ ...headers, Range:`${from}-${from + pageSize - 1}` },
    })
    if (!response.ok) {
      throw new Error(`GET ${String(path).split('?')[0]} respondió ${response.status}: ${(await response.text()).slice(0, 180)}`)
    }
    const batch = await response.json()
    if (!Array.isArray(batch)) throw new Error(`GET ${String(path).split('?')[0]} no devolvió una lista`)
    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }
}
