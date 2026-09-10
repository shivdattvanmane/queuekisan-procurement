import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { firebaseSignIn, firebaseSignUp, firebaseUpdateProfile, restSelect, titleFromEmail } from '../services/platform'

const AuthContext = createContext(null)
const STORAGE_KEY = 'queuekisan_admin_session'

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

async function ensureFirebaseSessionForExistingAdmin(account, password, username) {
  try {
    return await firebaseSignIn(account.email, password)
  } catch (error) {
    if (String(error.message || '').includes('INVALID_LOGIN_CREDENTIALS')) {
      if (account.password_hash !== password) {
        throw new Error('Incorrect admin credentials. Check your Admin ID and password.')
      }
      const authData = await firebaseSignUp(account.email, password)
      try {
        await firebaseUpdateProfile(authData.idToken, username || titleFromEmail(account.email))
      } catch {
        // ignore profile update failure; login still succeeded
      }
      return authData
    }
    throw error
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = loadSession()
    if (stored?.role === 'admin') setUser(stored)
    setIsLoading(false)
  }, [])

  const login = () => null

  const adminSignup = async () => {
    return { error: 'Admin self-signup is disabled. Use an existing administrator account.' }
  }

  const adminLogin = async ({ username, password, adminId, branch }) => {
    const id = String(adminId || '').trim()
    if (!id || !password) return null

    const rows = await restSelect('users', { select: '*', id: `in.("${id}","${id.toLowerCase()}","${id.toUpperCase()}")`, role: 'eq.ADMIN' })
    const account = rows[0]
    if (!account?.email) {
      throw new Error('Admin account not found. Use a valid existing Admin ID.')
    }

    const authData = await ensureFirebaseSessionForExistingAdmin(account, password, username)
    const nextUser = {
      id: account.id,
      name: authData.displayName || username || titleFromEmail(account.email),
      role: 'admin',
      designation: 'Administrator',
      adminId: account.id,
      branch: branch || account.phone || 'Admin Console',
      email: account.email,
      idToken: authData.idToken,
      refreshToken: authData.refreshToken,
      firebaseUid: authData.localId,
    }
    saveSession(nextUser)
    setUser(nextUser)
    return nextUser
  }

  const logout = () => {
    saveSession(null)
    setUser(null)
  }

  const value = useMemo(() => ({ user, isAuthenticated: !!user, isLoading, login, adminLogin, adminSignup, logout }), [user, isLoading])

  if (isLoading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading session...</div>
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export default AuthContext
