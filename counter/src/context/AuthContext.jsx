import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { firebaseSignIn, firebaseSignUp, firebaseUpdateProfile, restSelect, titleFromEmail } from '../services/platform'

const AuthContext = createContext(null)
const STORAGE_KEY = 'queuekisan_counter_session'

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function saveSession(session) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  else localStorage.removeItem(STORAGE_KEY)
}

function normalizeOfficer(user, counterRow, authData) {
  if (!user) return null
  return {
    id: String(user.id),
    officerId: String(user.id),
    identifier: String(user.id),
    name: authData?.displayName || titleFromEmail(user.email),
    role: 'counter',
    centreId: counterRow?.centre_id || '',
    centreName: counterRow?.centreName || '',
    counterId: counterRow?.id || '',
    counterNumber: counterRow?.counter_number || '',
    mobile: user.phone || '',
    status: counterRow?.status || 'active',
    language: 'en',
    email: user.email,
    idToken: authData?.idToken,
    refreshToken: authData?.refreshToken,
    firebaseUid: authData?.localId,
  }
}

async function fetchCounterProfile(officerId) {
  const rawId = String(officerId).trim()
  const users = await restSelect('users', { select: '*', id: `in.("${rawId}","${rawId.toLowerCase()}","${rawId.toUpperCase()}")`, role: 'eq.COUNTER_PERSON' })
  const user = users[0]
  if (!user) return null

  const counters = await restSelect('counters', { select: '*', officer_id: `eq.${user.id}` })
  const counterRow = counters[0] || null
  let centreName = ''
  if (counterRow?.centre_id) {
    const centres = await restSelect('procurement_centers', { select: 'id,name', id: `eq.${counterRow.centre_id}` })
    centreName = centres[0]?.name || counterRow.centre_id
  }
  return { user, counterRow: counterRow ? { ...counterRow, centreName } : null }
}

async function ensureFirebaseSessionForExistingOfficer(user, password) {
  try {
    return await firebaseSignIn(user.email, password)
  } catch (error) {
    if (String(error.message || '').includes('INVALID_LOGIN_CREDENTIALS')) {
      if (user.password_hash !== password) {
        throw new Error('Incorrect officer credentials. Check your Officer ID and password.')
      }
      const authData = await firebaseSignUp(user.email, password)
      try {
        await firebaseUpdateProfile(authData.idToken, titleFromEmail(user.email))
      } catch {
        // ignore profile update failure
      }
      return authData
    }
    throw error
  }
}

export function AuthProvider({ children }) {
  const [officer, setOfficer] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = loadSession()
    if (stored?.role === 'counter') {
      setOfficer(stored)
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const login = async (officerId, password) => {
    const profile = await fetchCounterProfile(officerId)
    if (!profile?.user?.email) throw new Error('Counter account not found. Use a valid existing Officer ID.')
    const authData = await ensureFirebaseSessionForExistingOfficer(profile.user, password)
    const nextOfficer = normalizeOfficer(profile.user, profile.counterRow, authData)
    saveSession(nextOfficer)
    setOfficer(nextOfficer)
    setIsAuthenticated(true)
    return nextOfficer
  }

  const signup = async () => {
    throw new Error('Counter self-signup is disabled. Use an existing officer account.')
  }

  const logout = () => {
    saveSession(null)
    setOfficer(null)
    setIsAuthenticated(false)
  }

  const value = useMemo(() => ({ officer, isAuthenticated, isLoading, login, signup, logout }), [officer, isAuthenticated, isLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
