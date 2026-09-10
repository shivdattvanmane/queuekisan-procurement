const KrushiAuth = {
  async login(mobile, password) {
    return window.KrushiAPI.login(mobile, password)
  },

  async register(formData) {
    const user = await window.KrushiAPI.register({
      fullName: formData.fullName,
      mobile: formData.mobile,
      email: formData.email,
      password: formData.password,
      farmerId: formData.farmerId,
      village: formData.village,
      language: formData.language,
    })
    localStorage.setItem('krushi_user', JSON.stringify(user))
    return { success: true, user }
  },

  async forgotPassword(mobile) {
    return window.KrushiAPI.forgotPassword(mobile)
  },

  isLoggedIn() {
    return window.KrushiAPI.isLoggedIn()
  },

  getCurrentUser() {
    return window.KrushiAPI.getCurrentUser()
  },

  logout() {
    window.KrushiAPI.logout()
  },
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)

  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 400)
  }, 3000)
}

function setLoading(button, loading) {
  const text = button.querySelector('.btn-text')
  const loader = button.querySelector('.btn-loader')
  if (text && loader) {
    text.style.display = loading ? 'none' : ''
    loader.style.display = loading ? 'inline-flex' : 'none'
  }
  button.disabled = loading
  button.style.opacity = loading ? '0.7' : '1'
}

function getTranslation(key, fallback) {
  if (window.t && typeof window.t === 'function') {
    return window.t(key, fallback)
  }
  return fallback
}

function showFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId)
  const error = document.getElementById(errorId)
  if (input) {
    const wrapper = input.closest('.input-wrapper')
    if (wrapper) wrapper.classList.add('error')
  }
  if (error) error.textContent = message
}

function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId)
  const error = document.getElementById(errorId)
  if (input) {
    const wrapper = input.closest('.input-wrapper')
    if (wrapper) wrapper.classList.remove('error')
  }
  if (error) error.textContent = ''
}

function clearAllErrors() {
  document.querySelectorAll('.input-wrapper.error').forEach((el) => el.classList.remove('error'))
  document.querySelectorAll('.field-error').forEach((el) => { el.textContent = '' })
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId)
  if (!input) return
  const eyeOpen = btn.querySelector('.eye-open')
  const eyeClosed = btn.querySelector('.eye-closed')

  if (input.type === 'password') {
    input.type = 'text'
    if (eyeOpen) eyeOpen.style.display = 'none'
    if (eyeClosed) eyeClosed.style.display = 'block'
  } else {
    input.type = 'password'
    if (eyeOpen) eyeOpen.style.display = 'block'
    if (eyeClosed) eyeClosed.style.display = 'none'
  }
}

const loginForm = document.getElementById('loginForm')
if (loginForm) {
  if (KrushiAuth.isLoggedIn()) {
    window.location.href = 'index.html'
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearAllErrors()

    const mobile = document.getElementById('loginMobile').value.trim()
    const password = document.getElementById('loginPassword').value
    let valid = true

    if (!mobile) {
      showFieldError('loginMobile', 'loginMobileError', getTranslation('error.mobileRequired', 'Please enter your mobile number.'))
      valid = false
    } else if (!/^[0-9]{10}$/.test(mobile)) {
      showFieldError('loginMobile', 'loginMobileError', getTranslation('error.mobileInvalid', 'Enter a valid 10-digit mobile number.'))
      valid = false
    }

    if (!password) {
      showFieldError('loginPassword', 'loginPasswordError', getTranslation('error.passwordRequired', 'Please enter your password.'))
      valid = false
    } else if (password.length < 6) {
      showFieldError('loginPassword', 'loginPasswordError', getTranslation('error.passwordTooShort', 'Password must be at least 6 characters.'))
      valid = false
    }

    if (!valid) return

    const btn = document.getElementById('loginBtn')
    setLoading(btn, true)

    try {
      const result = await KrushiAuth.login(mobile, password)
      showToast(`Welcome back, ${result.user.name}! 🌾`, 'success')
      setTimeout(() => { window.location.href = 'index.html' }, 1200)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(btn, false)
    }
  })

  const forgotLink = document.getElementById('forgotPasswordLink')
  if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
      e.preventDefault()
      const mobile = document.getElementById('loginMobile').value.trim()
      if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
        showToast(getTranslation('error.mobileRequired', 'Please enter your mobile number first.'), 'error')
        document.getElementById('loginMobile').focus()
        return
      }
      try {
        const result = await KrushiAuth.forgotPassword(mobile)
        showToast(result.message || 'Reset request submitted.', 'success')
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  }

  document.getElementById('loginMobile').addEventListener('input', () => clearFieldError('loginMobile', 'loginMobileError'))
  document.getElementById('loginPassword').addEventListener('input', () => clearFieldError('loginPassword', 'loginPasswordError'))
}

const registerForm = document.getElementById('registerForm')
if (registerForm && KrushiAuth.isLoggedIn()) {
  window.location.href = 'index.html'
}

function goToStep2() {
  clearAllErrors()
  let valid = true

  const name = document.getElementById('regName').value.trim()
  const mobile = document.getElementById('regMobile').value.trim()
  const password = document.getElementById('regPassword').value
  const confirmPasswordEl = document.getElementById('regConfirmPassword')
  const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value : ''

  const email = document.getElementById('regEmail')?.value.trim() || ''

  if (!name || name.length < 2) {
    showFieldError('regName', 'regNameError', getTranslation('error.nameRequired', 'Please enter your full name.'))
    valid = false
  }
  if (!mobile) {
    showFieldError('regMobile', 'regMobileError', getTranslation('error.mobileRequired', 'Please enter your mobile number.'))
    valid = false
  } else if (!/^[0-9]{10}$/.test(mobile)) {
    showFieldError('regMobile', 'regMobileError', getTranslation('error.mobileInvalid', 'Enter a valid 10-digit mobile number.'))
    valid = false
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('regEmail', 'regEmailError', getTranslation('error.emailInvalid', 'Please enter a valid email address.'))
    valid = false
  }
  if (!password) {
    showFieldError('regPassword', 'regPasswordError', getTranslation('error.passwordRequired', 'Please create a password.'))
    valid = false
  } else if (password.length < 6) {
    showFieldError('regPassword', 'regPasswordError', getTranslation('error.passwordTooShort', 'Password must be at least 6 characters.'))
    valid = false
  }

  // Confirm Password Validation
  if (confirmPasswordEl) {
    if (!confirmPassword) {
      showFieldError('regConfirmPassword', 'regConfirmPasswordError', getTranslation('error.confirmPasswordRequired', 'Please confirm your password.'))
      valid = false
    } else if (password !== confirmPassword) {
      showFieldError('regConfirmPassword', 'regConfirmPasswordError', getTranslation('error.passwordMismatch', 'Passwords do not match. Please re-enter.'))
      valid = false
    }
  }

  if (!valid) return

  document.getElementById('registerStep1').style.display = 'none'
  document.getElementById('registerStep2').style.display = 'block'
  document.getElementById('registerStep2').style.animation = 'none'
  requestAnimationFrame(() => {
    document.getElementById('registerStep2').style.animation = ''
  })

  document.getElementById('step1Dot').classList.remove('active')
  document.getElementById('step1Dot').classList.add('completed')
  document.getElementById('step2Dot').classList.add('active')
  document.querySelector('.step-line').classList.add('active')
}

function goToStep1() {
  document.getElementById('registerStep2').style.display = 'none'
  document.getElementById('registerStep1').style.display = 'block'
  document.getElementById('step2Dot').classList.remove('active')
  document.getElementById('step1Dot').classList.remove('completed')
  document.getElementById('step1Dot').classList.add('active')
  document.querySelector('.step-line').classList.remove('active')
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearAllErrors()
    let valid = true

    const farmerId = document.getElementById('regFarmerId').value.trim()
    const village = document.getElementById('regVillage').value.trim()
    const language = document.getElementById('regLanguage').value

    if (!farmerId) {
      showFieldError('regFarmerId', 'regFarmerIdError', getTranslation('error.farmerIdRequired', 'Please enter your Farmer ID or Aadhaar.'))
      valid = false
    }
    if (!village) {
      showFieldError('regVillage', 'regVillageError', getTranslation('error.villageRequired', 'Please enter your village or location.'))
      valid = false
    }
    if (!language) {
      showFieldError('regLanguage', 'regLanguageError', getTranslation('error.languageRequired', 'Please select your preferred language.'))
      valid = false
    }
    if (!valid) return

    const btn = document.getElementById('registerBtn')
    setLoading(btn, true)

    const formData = {
      fullName: document.getElementById('regName').value.trim(),
      mobile: document.getElementById('regMobile').value.trim(),
      email: document.getElementById('regEmail')?.value.trim() || '',
      password: document.getElementById('regPassword').value,
      farmerId,
      village,
      language,
    }

    try {
      const result = await KrushiAuth.register(formData)
      showToast(`Welcome to QueueKisan, ${result.user.name}! 🌱`, 'success')
      setTimeout(() => { window.location.href = 'index.html' }, 1500)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(btn, false)
    }
  })

  ;['regFarmerId', 'regVillage', 'regLanguage', 'regName', 'regMobile', 'regEmail', 'regPassword', 'regConfirmPassword'].forEach((id) => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener('input', () => clearFieldError(id, `${id}Error`))
      el.addEventListener('change', () => clearFieldError(id, `${id}Error`))
    }
  })
}

window.goToStep1 = goToStep1
window.goToStep2 = goToStep2
window.togglePasswordVisibility = togglePasswordVisibility
