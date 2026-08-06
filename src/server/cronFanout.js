function responseCapture() {
  let statusCode = 200
  let payload = null
  const response = {
    status(code) {
      statusCode = code
      return response
    },
    json(value) {
      payload = value
      return value
    },
  }
  return { response, result:() => ({ statusCode, payload }) }
}

export async function runCronFanout(req, jobs) {
  const results = []
  for (const [name, handler] of jobs) {
    const capture = responseCapture()
    try {
      await handler(req, capture.response)
      results.push({ name, ...capture.result() })
    } catch (error) {
      results.push({ name, statusCode:500, payload:{ error:String(error?.message || error) } })
    }
  }
  const ok = results.every(result => result.statusCode >= 200 && result.statusCode < 300)
  return { ok, statusCode:ok ? 200 : 500, results }
}
