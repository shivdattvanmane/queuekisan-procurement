import 'dotenv/config'

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const REST_BASE = `${SUPABASE_URL}/rest/v1`

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[QueueServer] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. API calls will fail until server env is configured.')
}

async function parseResponse(response) {
  const text = await response.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || data?.detail || text || 'Supabase request failed')
    error.status = response.status
    error.payload = data
    throw error
  }
  return data
}

export async function rest(method, table, { params = {}, body, headers = {} } = {}) {
  const url = new URL(`${REST_BASE}/${table}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })
  const response = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return parseResponse(response)
}

export const restSelect = (table, params = {}) => rest('GET', table, { params })
export const restInsert = (table, body, params = {}, headers = {}) => rest('POST', table, { body, params, headers })
export const restUpdate = (table, params, body) => rest('PATCH', table, { params, body })
export const restDelete = (table, params) => rest('DELETE', table, { params })
export const restRpc = async (fnName, body = {}, headers = {}) => {
  const response = await fetch(`${REST_BASE}/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: JSON.stringify(body || {}),
  })
  return parseResponse(response)
}

const capabilityCache = new Map()

async function probe(key, task) {
  if (capabilityCache.has(key)) return capabilityCache.get(key)
  const promise = task()
    .then((value) => {
      capabilityCache.set(key, Promise.resolve(value))
      return value
    })
    .catch(() => {
      capabilityCache.set(key, Promise.resolve(false))
      return false
    })
  capabilityCache.set(key, promise)
  return promise
}

export async function hasTable(table) {
  return probe(`table:${table}`, async () => {
    await restSelect(table, { select: '*', limit: '1' })
    return true
  })
}

export async function hasColumn(table, column) {
  return probe(`column:${table}:${column}`, async () => {
    await restSelect(table, { select: column, limit: '1' })
    return true
  })
}
