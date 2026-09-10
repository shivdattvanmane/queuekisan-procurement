import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import AdminLayout from './components/layout/AdminLayout'
import { useAuth } from './context/AuthContext'
import { useLanguage } from './context/LanguageContext'
import LanguageSelector from './components/common/LanguageSelector'
import { FiAlertTriangle, FiUser, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi'
import Dashboard from './pages/Dashboard'
import Farmers from './pages/Farmers'
import Procurement from './pages/Procurement'
import Payments from './pages/Payments'
import CentresSlots from './pages/CentresSlots'
import QueueMonitoring from './pages/QueueMonitoring'
import Analytics from './pages/Analytics'
import Reports from './pages/Reports'

function AdminProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()
  if (!isAuthenticated || !user) return <Navigate to="/admin-auth" state={{ from: location }} replace />
  return children
}

function AdminAuth() {
  const { adminLogin } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '', adminId: '', branch: '' })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const loggedIn = await adminLogin(form)
      if (loggedIn) navigate('/', { replace: true })
      else setError('Incorrect admin credentials. Check your Admin ID and password.')
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '24px' }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '500px', background: 'white', borderRadius: '16px', padding: '48px 40px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-16px' }}><LanguageSelector /></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ width: '64px', height: '64px', background: 'var(--krushi-green)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '32px', marginBottom: '20px', fontWeight: 'bold' }}>🌿</div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--krushi-green)', margin: '0 0 8px 0', textAlign: 'center', letterSpacing: '-0.5px' }}>QueueKisan</h1>
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-text-primary)', margin: '0 0 12px 0', textAlign: 'center' }}>{t('auth.adminLogin')}</p>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0', textAlign: 'center' }}>{t('auth.signInDesc')}</p>
        </div>

        {error && <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: '8px', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label={t('auth.username')} icon={<FiUser />}>
            <input type="text" placeholder={t('auth.usernamePlaceholder')} value={form.username} onChange={(event) => updateField('username', event.target.value)} style={inputStyle(true)} />
          </Field>
          <Field label={t('auth.password')} icon={<FiLock />}>
            <div style={{ position: 'relative' }}>
              <input required type={showPassword ? 'text' : 'password'} placeholder={t('auth.passwordPlaceholder')} value={form.password} onChange={(event) => updateField('password', event.target.value)} style={inputStyle(true)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>{showPassword ? <FiEyeOff /> : <FiEye />}</button>
            </div>
          </Field>
          <Field label={t('auth.adminId')} icon={<FiUser />}>
            <input required type="text" placeholder="usr-a001" value={form.adminId} onChange={(event) => updateField('adminId', event.target.value)} style={inputStyle(true)} />
          </Field>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{t('auth.branch')}</label>
            <input type="text" placeholder={t('auth.branchPlaceholder')} value={form.branch} onChange={(event) => updateField('branch', event.target.value)} style={{ ...inputStyle(), padding: '12px 14px' }} />
          </div>
        </div>

        <button type="submit" style={{ padding: '14px 24px', background: 'var(--krushi-green)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>{t('btn.login')} <FiArrowRight size={16} /></button>

        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>{t('auth.helperText')}</div>
      </form>
    </div>
  )
}

function Unauthorized() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div className="card" style={{ width: '450px', padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', color: '#F59E0B', marginBottom: '16px' }}><FiAlertTriangle style={{ margin: '0 auto' }} /></div>
        <h2 style={{ marginBottom: '16px', color: 'var(--color-text-primary)' }}>Access Denied</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>You do not have permission to access the admin workspace.</p>
        <button className="btn btn-outline" onClick={() => { logout(); navigate('/admin-auth') }}>Logout</button>
      </div>
    </div>
  )
}

function Field({ label, icon, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: '14px', color: 'var(--color-text-secondary)', fontSize: '16px', pointerEvents: 'none' }}>{icon}</span>
        {children}
      </div>
    </div>
  )
}

const inputStyle = (withIcon = false) => ({ width: '100%', padding: withIcon ? '12px 14px 12px 40px' : '12px 14px', fontSize: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', outline: 'none', transition: 'all 150ms ease' })

export default function App() {
  return (
    <Routes>
      <Route path="/admin-auth" element={<AdminAuth />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/" element={<AdminProtectedRoute><AdminLayout /></AdminProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="farmers" element={<Farmers />} />
        <Route path="procurement" element={<Procurement />} />
        <Route path="payments" element={<Payments />} />
        <Route path="centres-slots" element={<CentresSlots />} />
        <Route path="queue" element={<QueueMonitoring />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="/login" element={<Navigate to="/admin-auth" replace />} />
      <Route path="*" element={<Navigate to="/admin-auth" replace />} />
    </Routes>
  )
}
