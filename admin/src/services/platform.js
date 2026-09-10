const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY
const REST_BASE = `${SUPABASE_URL}/rest/v1`
const FIREBASE_BASE = 'https://identitytoolkit.googleapis.com/v1'

export function titleFromEmail(email = '') {
  const local = email.split('@')[0].replace(/\.(adm|off)\d+$/i, '')
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || email
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.detail || 'Request failed'
    throw new Error(message)
  }
  return data
}

export async function restSelect(table, params = {}) {
  const url = new URL(`${REST_BASE}/${table}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })
  const response = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  })
  return parseResponse(response)
}

export async function restMutate(method, table, params = {}, body) {
  const url = new URL(`${REST_BASE}/${table}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })
  const response = await fetch(url.toString(), {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return parseResponse(response)
}

export const restInsert = (table, body) => restMutate('POST', table, {}, body)
export const restUpdate = (table, params, body) => restMutate('PATCH', table, params, body)
export const restDelete = (table, params) => restMutate('DELETE', table, params)

export async function firebaseSignUp(email, password) {
  const response = await fetch(`${FIREBASE_BASE}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await response.json().catch(() => ({}))
  if (response.ok) return data
  if (data?.error?.message === 'EMAIL_EXISTS') {
    return firebaseSignIn(email, password)
  }
  throw new Error(data?.error?.message || 'Unable to create account')
}

export async function firebaseSignIn(email, password) {
  const response = await fetch(`${FIREBASE_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  return parseResponse(response)
}

export async function firebaseUpdateProfile(idToken, displayName) {
  const response = await fetch(`${FIREBASE_BASE}/accounts:update?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, displayName, returnSecureToken: true }),
  })
  return parseResponse(response)
}
