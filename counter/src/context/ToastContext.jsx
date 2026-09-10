import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.clearTimeout(showToast.timeoutId)
    showToast.timeoutId = window.setTimeout(() => {
      setToast(null)
    }, 3500)
  }, [])

  const value = useMemo(
    () => ({ toast, showToast }),
    [toast, showToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 2000,
            background: toast.type === 'error' ? '#d93b3b' : '#207A40',
            color: '#fff',
            borderRadius: 12,
            padding: '12px 18px',
            boxShadow: '0 16px 36px rgba(0,0,0,0.18)',
            maxWidth: 360,
            fontWeight: 600,
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
