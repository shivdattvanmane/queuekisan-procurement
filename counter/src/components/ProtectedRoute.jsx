import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Wraps protected ACC routes.
 * Redirects unauthenticated users to /acc/login.
 * Preserves the attempted URL so we can redirect back after login.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'var(--font-family)',
          color: 'var(--color-text-muted)',
          fontSize: '1rem',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/acc/login" state={{ from: location }} replace />
  }

  return children
}
