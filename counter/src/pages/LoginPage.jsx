import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Sprout,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import LanguageSelector from '../components/LanguageSelector'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated } = useAuth()
  const { t } = useLanguage()

  /* Redirect if already authenticated */
  if (isAuthenticated) {
    navigate('/acc/dashboard', { replace: true })
  }

  /* ── Form state ── */
  const [officerId, setOfficerId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const mode = 'login'

  /* ── UI state ── */
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [showForgotModal, setShowForgotModal] = useState(false)

  /* ── Validation ── */
  function validate() {
    const errors = {}

    if (!officerId.trim()) {
      errors.officerId = t('login.officerIdRequired')
    }

    if (!password) {
      errors.password = t('login.passwordRequired')
    } else if (password.length < 4) {
      errors.password = t('login.invalidPassword')
    }

    return errors
  }

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault()
    setGlobalError('')

    const errors = validate()
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)

    try {
      await login(officerId.trim(), password, rememberMe)
      const redirectTo = location.state?.from?.pathname || '/acc/dashboard'
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setGlobalError(err.message || t('login.loginFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* ── Language Selector (top-right of card) ── */}
        <div className="login-language-selector">
          <LanguageSelector variant="login" />
        </div>

        {/* ── Brand Header ── */}
        <div className="login-brand">
          <div className="login-logo">
            <Sprout size={28} strokeWidth={2.2} />
          </div>
          <div className="login-brand-name">
            Queue<span>Kisan</span>
          </div>
          <h1 className="login-title">{mode === 'login' ? t('login.accTitle') : t('login.accSignupTitle')}</h1>
          <p className="login-subtitle">
            {mode === 'login'
              ? t('login.accSubtitle')
              : t('login.accSignupSubtitle')}
          </p>
        </div>

        {/* ── Global Error Banner ── */}
        {globalError && (
          <div className="login-error-banner" role="alert">
            <AlertCircle size={16} color="var(--color-error)" />
            <span className="login-error-text">{globalError}</span>
          </div>
        )}

        {/* ── Form ── */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="name">
                  {t('login.fullName')}
                </label>
                <div className="field-input-wrapper">
                  <span className="field-icon">
                    <User size={18} />
                  </span>
                  <input
                    id="name"
                    className={`field-input${fieldErrors.name ? ' field-input--error' : ''}`}
                    type="text"
                    placeholder={t('login.fullNamePlaceholder')}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (fieldErrors.name) {
                        setFieldErrors((prev) => ({ ...prev, name: '' }))
                      }
                    }}
                    disabled={isSubmitting}
                  />
                </div>
                {fieldErrors.name && (
                  <span className="field-error">
                    <AlertCircle size={12} />
                    {fieldErrors.name}
                  </span>
                )}
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="centreName">
                  {t('login.procurementCentre')}
                </label>
                <div className="field-input-wrapper">
                  <span className="field-icon">
                    <Sprout size={18} />
                  </span>
                  <input
                    id="centreName"
                    className={`field-input${fieldErrors.centreName ? ' field-input--error' : ''}`}
                    type="text"
                    placeholder={t('login.procurementCentrePlaceholder')}
                    value={centreName}
                    onChange={(e) => {
                      setCentreName(e.target.value)
                      if (fieldErrors.centreName) {
                        setFieldErrors((prev) => ({ ...prev, centreName: '' }))
                      }
                    }}
                    disabled={isSubmitting}
                  />
                </div>
                {fieldErrors.centreName && (
                  <span className="field-error">
                    <AlertCircle size={12} />
                    {fieldErrors.centreName}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Officer ID */}
          <div className="field-group">
            <label className="field-label" htmlFor="officerId">
              {t('login.officerId')}
            </label>
            <div className="field-input-wrapper">
              <span className="field-icon">
                <User size={18} />
              </span>
              <input
                id="officerId"
                className={`field-input${fieldErrors.officerId ? ' field-input--error' : ''}`}
                type="text"
                placeholder={t('login.officerIdPlaceholder')}
                autoComplete="username"
                value={officerId}
                onChange={(e) => {
                  setOfficerId(e.target.value)
                  if (fieldErrors.officerId) {
                    setFieldErrors((prev) => ({ ...prev, officerId: '' }))
                  }
                }}
                disabled={isSubmitting}
              />
            </div>
            {fieldErrors.officerId && (
              <span className="field-error">
                <AlertCircle size={12} />
                {fieldErrors.officerId}
              </span>
            )}
          </div>

          {/* Password */}
          <div className="field-group">
            <label className="field-label" htmlFor="password">
              {t('login.password')}
            </label>
            <div className="field-input-wrapper">
              <span className="field-icon">
                <Lock size={18} />
              </span>
              <input
                id="password"
                className={`field-input${fieldErrors.password ? ' field-input--error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: '' }))
                  }
                }}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <span className="field-error">
                <AlertCircle size={12} />
                {fieldErrors.password}
              </span>
            )}
          </div>

          {/* Confirm Password (Signup only) */}
          {mode === 'signup' && (
            <div className="field-group">
              <label className="field-label" htmlFor="confirmPassword">
                {t('login.confirmPassword')}
              </label>
              <div className="field-input-wrapper">
                <span className="field-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="confirmPassword"
                  className={`field-input${fieldErrors.confirmPassword ? ' field-input--error' : ''}`}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('login.confirmPasswordPlaceholder')}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    if (fieldErrors.confirmPassword) {
                      setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }))
                    }
                  }}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <span className="field-error">
                  <AlertCircle size={12} />
                  {fieldErrors.confirmPassword}
                </span>
              )}
            </div>
          )}

          {/* Remember Me + Forgot Password */}
          <div className="login-extras">
            <label className="remember-me">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isSubmitting}
              />
              {t('login.rememberMe')}
            </label>
            <button
              type="button"
              className="forgot-password"
              onClick={() => setShowForgotModal(true)}
              disabled={isSubmitting}
            >
              {t('login.forgotPassword')}
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="login-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                {mode === 'signup' ? t('login.creatingAccount') : t('login.signingIn')}
              </>
            ) : (
              <>
                <LogIn size={18} />
                {mode === 'signup' ? t('login.signupButton') : t('login.loginButton')}
              </>
            )}
          </button>
        </form>

        {/* ── Footer ── */}
        <div className="login-footer">
          <p className="login-footer-text">
            {mode === 'login'
              ? t('login.footerLogin')
              : t('login.footerSignup')}
          </p>
        </div>
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgotModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowForgotModal(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{t('login.resetPassword')}</h2>
            <p className="modal-description">
              {t('login.resetDescription')}
            </p>
            <div className="field-group">
              <label className="field-label" htmlFor="resetId">
                {t('login.officerId')}
              </label>
              <div className="field-input-wrapper">
                <span className="field-icon">
                  <User size={18} />
                </span>
                <input
                  id="resetId"
                  className="field-input"
                  type="text"
                  placeholder={t('login.officerIdPlaceholder')}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowForgotModal(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary-small"
                onClick={() => {
                  alert(t('login.resetAlert'))
                  setShowForgotModal(false)
                }}
              >
                {t('login.sendReset')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
