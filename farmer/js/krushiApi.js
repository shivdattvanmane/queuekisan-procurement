(function () {
  const SUPABASE_URL = window.KRUSHI_SUPABASE_URL
  const SUPABASE_ANON_KEY = window.KRUSHI_SUPABASE_ANON_KEY
  const FIREBASE_API_KEY = window.KRUSHI_FIREBASE_API_KEY
  const FIREBASE_BASE = window.KRUSHI_FIREBASE_BASE || 'https://identitytoolkit.googleapis.com/v1'
  const QUEUE_SERVER_URL = window.KRUSHI_QUEUE_SERVER_URL || ''
  const REST_BASE = `${SUPABASE_URL}/rest/v1`

  const USER_KEY = 'krushi_user'
  const ACTIVE_BOOKING_KEY = 'krushi_active_booking_id'
  const LAST_LOGOUT_KEY = 'krushi_last_logout_at'

  function loadJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  }

  function saveJson(key, value) {
    if (value) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  }

  async function parseResponse(response) {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || data?.detail || 'Request failed')
    }
    return data
  }

  async function restSelect(table, params = {}) {
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

  async function restMutate(method, table, params = {}, body) {
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

  const restInsert = (table, body) => restMutate('POST', table, {}, body)
  const restUpdate = (table, params, body) => restMutate('PATCH', table, params, body)

  async function requestQueueServer(path, options = {}) {
    const response = await fetch(`${QUEUE_SERVER_URL}${path}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || data?.message || 'Queue server request failed')
    return data
  }

  async function firebaseSignUp(email, password) {
    try {
      const response = await fetch(`${FIREBASE_BASE}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) return data
      if (data?.error?.message === 'EMAIL_EXISTS') return await firebaseSignIn(email, password)
      console.warn('[Firebase Auth] Sign up notice:', data?.error?.message)
    } catch (err) {
      console.warn('[Firebase Auth] Sign up network fallback:', err.message)
    }
    return {
      localId: `usr-fb-${Date.now()}`,
      idToken: `token-${Date.now()}`,
      refreshToken: `ref-${Date.now()}`,
      email,
    }
  }

  async function firebaseSignIn(email, password) {
    try {
      const response = await fetch(`${FIREBASE_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) return data
      if (data?.error?.message) throw new Error(data.error.message)
    } catch (err) {
      if (String(err.message).includes('INVALID_LOGIN_CREDENTIALS') || String(err.message).includes('INVALID_PASSWORD')) {
        throw err
      }
      console.warn('[Firebase Auth] Sign in notice:', err.message)
    }
    return {
      localId: `usr-fb-${Date.now()}`,
      idToken: `token-${Date.now()}`,
      refreshToken: `ref-${Date.now()}`,
      email,
    }
  }

  async function firebaseUpdateProfile(idToken, displayName) {
    const response = await fetch(`${FIREBASE_BASE}/accounts:update?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, displayName, returnSecureToken: true }),
    })
    return parseResponse(response)
  }

  async function firebaseResetPassword(email) {
    const response = await fetch(`${FIREBASE_BASE}/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    })
    return parseResponse(response)
  }

  function getStoredUser() {
    return loadJson(USER_KEY)
  }

  function storeUser(user) {
    saveJson(USER_KEY, user)
    return user
  }

  function setActiveBookingId(id) {
    if (id) localStorage.setItem(ACTIVE_BOOKING_KEY, String(id))
    else localStorage.removeItem(ACTIVE_BOOKING_KEY)
  }

  function getActiveBookingId() {
    return localStorage.getItem(ACTIVE_BOOKING_KEY)
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  }

  function localIsoDate(value = new Date()) {
    const date = new Date(value)
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 10)
  }

  function paymentProfileKey(farmerId) {
    return `krushi_payment_profile_${farmerId}`
  }

  function normalizePaymentProfile(row = {}) {
    return {
      accountHolder: row.account_holder || row.accountHolder || '',
      bankName: row.bank_name || row.bankName || '',
      accountNumber: row.account_number || row.accountNumber || '',
      ifscCode: row.ifsc_code || row.ifscCode || '',
      upiId: row.upi_id || row.upiId || '',
      updatedAt: row.updated_at || row.updatedAt || '',
    }
  }

  function getStoredPaymentProfile(farmerId) {
    return normalizePaymentProfile(loadJson(paymentProfileKey(farmerId)) || {})
  }

  function saveStoredPaymentProfile(farmerId, profile) {
    const payload = { ...normalizePaymentProfile(profile), updatedAt: new Date().toISOString() }
    saveJson(paymentProfileKey(farmerId), payload)
    return payload
  }

  async function getPaymentProfileForFarmer(farmerId) {
    if (!farmerId) return normalizePaymentProfile()
    try {
      const rows = await restSelect('farmer_payment_details', { select: '*', farmer_id: `eq.${farmerId}` })
      if (rows[0]) {
        const profile = normalizePaymentProfile(rows[0])
        saveStoredPaymentProfile(farmerId, profile)
        return { ...profile, source: 'supabase' }
      }
    } catch (error) {
      console.warn('[KrushiAPI] farmer_payment_details table not available; using local profile storage.', error.message)
    }
    return { ...getStoredPaymentProfile(farmerId), source: 'local' }
  }

  async function savePaymentProfileForFarmer(farmerId, profile) {
    if (!farmerId) throw new Error('Please sign in to save payment details.')
    const normalized = saveStoredPaymentProfile(farmerId, profile)
    const dbPayload = {
      farmer_id: farmerId,
      account_holder: normalized.accountHolder,
      bank_name: normalized.bankName,
      account_number: normalized.accountNumber,
      ifsc_code: normalized.ifscCode,
      upi_id: normalized.upiId,
      updated_at: normalized.updatedAt,
    }

    try {
      const existing = await restSelect('farmer_payment_details', { select: '*', farmer_id: `eq.${farmerId}` })
      if (existing[0]) await restUpdate('farmer_payment_details', { farmer_id: `eq.${farmerId}` }, dbPayload)
      else await restInsert('farmer_payment_details', dbPayload)
      return { ...normalized, source: 'supabase' }
    } catch (error) {
      console.warn('[KrushiAPI] Unable to save payment profile in Supabase; saved locally.', error.message)
      return { ...normalized, source: 'local' }
    }
  }

  function formatStatus(row) {
    if (!row) return 'Waiting'
    if (row.queue_status === 'completed' || row.procurement_status === 'completed') return 'Completed'
    if (row.queue_status === 'serving') return 'Serving'
    if (row.queue_status === 'skipped' || row.queue_status === 'no-show') return 'Cancelled'
    if (row.check_in_status === 'checked-in') return 'Checked-in'
    return 'Waiting'
  }

  function normalizeBooking(row, context = {}) {
    if (!row) return null
    return {
      id: row.id,
      bookingId: row.id,
      booking_code: row.id,
      tokenNumber: row.token_number,
      token: row.token_number,
      centre: context.centreName || row.centre_id,
      centreName: context.centreName || row.centre_id,
      centreLocation: context.centreLocation || '',
      crop: context.crop || 'Not recorded',
      cropId: context.cropId,
      date: row.slot_date,
      slotDate: row.slot_date,
      slot: row.slot_time,
      slotTime: row.slot_time,
      quantityKg: Number(context.quantity || 0),
      quantity: Number(context.quantity || 0),
      quantityUnit: 'kg',
      unit: 'kg',
      checkIn: row.check_in_status,
      queueStatus: row.queue_status,
      procurementStatus: context.procurementStatus || 'pending',
      paymentStatus: context.paymentStatus || 'pending',
      amount: Number(context.amount || 0),
      quality: context.quality || '',
      remarks: context.remarks || '',
      moisture: context.moisture || '',
      referenceId: context.referenceId || '',
      paymentDate: context.paymentDate || '',
      centreId: row.centre_id,
      slotId: context.slotId || '',
      status: formatStatus({ ...row, procurement_status: context.procurementStatus }),
    }
  }

  async function getFarmerSessionBundle() {
    const user = getStoredUser()
    if (!user?.farmerId) return null
    const [farmerRows, userRows] = await Promise.all([
      restSelect('farmers', { select: '*', id: `eq.${user.farmerId}` }),
      restSelect('users', { select: '*', id: `eq.${user.userId || user.uidPublic || user.user_id || ''}` }),
    ])
    return { session: user, farmer: farmerRows[0] || null, publicUser: userRows[0] || null }
  }

  async function getCentreMap() {
    const centres = await restSelect('centres', { select: '*' })
    return Object.fromEntries(centres.filter((row) => row.code).map((row) => [row.code, row]))
  }

  async function buildBookingContext(row) {
    const [centreRows, procurements, payments, centreMap, crops] = await Promise.all([
      restSelect('procurement_centers', { select: '*', id: `eq.${row.centre_id}` }),
      restSelect('procurements', { select: '*', token_id: `eq.${row.id}` }),
      restSelect('payments', { select: '*' }),
      getCentreMap(),
      restSelect('crops', { select: '*' }),
    ])
    const procurement = procurements[0]
    const payment = payments.find((item) => item.procurement_id === procurement?.id)
    const crop = crops.find((item) => item.name.toLowerCase() === String(procurement?.crop || '').toLowerCase())
    return {
      centreName: centreRows[0]?.name || row.centre_id,
      centreLocation: centreRows[0] ? `${centreRows[0].taluka}, ${centreRows[0].district}` : '',
      crop: procurement?.crop || 'Not recorded',
      cropId: crop?.id,
      quantity: procurement?.quantity,
      quality: procurement?.quality_grade,
      remarks: procurement?.variety,
      moisture: procurement?.moisture_content,
      amount: procurement?.amount,
      procurementStatus: procurement?.status || 'pending',
      paymentStatus: payment?.status || 'pending',
      paymentDate: payment?.payment_date || '',
      referenceId: payment?.reference_id || '',
      slotId: centreMap[row.centre_id]?.id || '',
    }
  }

  async function getAllBookingsForFarmer(farmerId) {
    const tokens = await restSelect('queue_tokens', { select: '*', farmer_id: `eq.${farmerId}` })
    const rows = await Promise.all(tokens.map(async (row) => normalizeBooking(row, await buildBookingContext(row))))
    return rows.sort((a, b) => `${b.date} ${b.slot}`.localeCompare(`${a.date} ${a.slot}`))
  }

  async function findUserAndFarmerByMobile(mobile) {
    const rawMobile = String(mobile || '').replace(/\D/g, '')
    // 1. Try farmers by mobile
    let farmers = rawMobile ? await restSelect('farmers', { select: '*', mobile: `eq.${rawMobile}` }).catch(() => []) : []
    let farmer = farmers[0] || null
    let publicUser = null

    if (farmer?.user_id) {
      const users = await restSelect('users', { select: '*', id: `eq.${farmer.user_id}` }).catch(() => [])
      publicUser = users[0] || null
    }

    // 2. If user not found, look in users by phone
    if (!publicUser && rawMobile) {
      const users = await restSelect('users', { select: '*', phone: `eq.${rawMobile}` }).catch(() => [])
      publicUser = users[0] || null
    }

    // 3. If farmer was not found but user was found, find farmer by user_id
    if (!farmer && publicUser?.id) {
      const farmerRows = await restSelect('farmers', { select: '*', user_id: `eq.${publicUser.id}` }).catch(() => [])
      farmer = farmerRows[0] || null
    }

    return { farmer, publicUser }
  }

  async function ensureFirebaseSessionForExistingFarmer(publicUser, farmer, password) {
    try {
      return await firebaseSignIn(publicUser.email, password)
    } catch (error) {
      if (String(error.message || '').includes('INVALID_LOGIN_CREDENTIALS') || String(error.message || '').includes('INVALID_PASSWORD')) {
        if (publicUser.password_hash && publicUser.password_hash !== password) {
          throw new Error('Incorrect mobile number or password.')
        }
        const authData = await firebaseSignUp(publicUser.email, password)
        try {
          await firebaseUpdateProfile(authData.idToken, farmer?.name || publicUser.email)
        } catch {
          // ignore profile update failure
        }
        return authData
      }
      throw error
    }
  }

  async function nextId(table, field, prefix, width = 3) {
    const rows = await restSelect(table, { select: field }).catch(() => [])
    const next = rows
      .map((row) => Number(String(row[field] || '').replace(/\D/g, '')))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0) + 1
    return `${prefix}${String(next).padStart(width, '0')}`
  }

  async function createOrUpdateFarmerAccount(payload) {
    const rawMobile = String(payload.mobile || '').replace(/\D/g, '')
    const hasValidEmail = payload.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())
    const cleanEmail = hasValidEmail
      ? payload.email.trim().toLowerCase()
      : `${rawMobile || 'farmer'}@farmers.queuekisan.in`

    // 1. Find existing farmer by ID or mobile
    let farmer = null
    if (payload.farmerId) {
      const byId = await restSelect('farmers', { select: '*', id: `eq.${payload.farmerId.trim()}` }).catch(() => [])
      if (byId[0]) farmer = byId[0]
    }
    if (!farmer && rawMobile) {
      const byMobile = await restSelect('farmers', { select: '*', mobile: `eq.${rawMobile}` }).catch(() => [])
      if (byMobile[0]) farmer = byMobile[0]
    }

    // 2. Find existing user in users table by farmer.user_id, email, or phone
    let publicUser = null
    if (farmer?.user_id) {
      const byFarmerUser = await restSelect('users', { select: '*', id: `eq.${farmer.user_id}` }).catch(() => [])
      if (byFarmerUser[0]) publicUser = byFarmerUser[0]
    }
    if (!publicUser && rawMobile) {
      const byPhone = await restSelect('users', { select: '*', phone: `eq.${rawMobile}` }).catch(() => [])
      if (byPhone[0]) publicUser = byPhone[0]
    }
    if (!publicUser && cleanEmail) {
      const byEmail = await restSelect('users', { select: '*', email: `eq.${cleanEmail}` }).catch(() => [])
      if (byEmail[0]) publicUser = byEmail[0]
    }

    // If farmer was not found yet, check if one exists for publicUser.id
    if (!farmer && publicUser?.id) {
      const byUserId = await restSelect('farmers', { select: '*', user_id: `eq.${publicUser.id}` }).catch(() => [])
      if (byUserId[0]) farmer = byUserId[0]
    }

    // Determine IDs
    let userId = publicUser?.id || ''
    if (!userId) {
      userId = await nextId('users', 'id', 'usr-f')
    }

    let farmerId = farmer?.id || ''
    if (!farmerId) {
      farmerId = /^FRM-/i.test(payload.farmerId || '') ? payload.farmerId.trim().toUpperCase() : await nextId('farmers', 'id', 'FRM-')
    }

    const email = cleanEmail || publicUser?.email || `${rawMobile}@farmers.queuekisan.in`

    // Firebase Auth signup / signin fallback
    let authData = null
    try {
      authData = await firebaseSignUp(email, payload.password)
      if (authData?.idToken) {
        await firebaseUpdateProfile(authData.idToken, payload.fullName).catch(() => {})
      }
    } catch {
      authData = {
        localId: `usr-fb-${Date.now()}`,
        idToken: `token-${Date.now()}`,
        refreshToken: `ref-${Date.now()}`,
        email,
      }
    }

    const userPayload = {
      id: userId,
      email,
      phone: rawMobile,
      password_hash: payload.password,
      role: 'FARMER',
    }

    const farmerPayload = {
      id: farmerId,
      user_id: userId,
      name: payload.fullName,
      mobile: rawMobile,
      village: payload.village || 'Ahmednagar',
      taluka: payload.village || 'Ahmednagar',
      district: 'Ahmednagar',
      registered_date: localIsoDate(),
    }

    // 3. Persist users table (safely update or insert)
    if (publicUser?.id) {
      await restUpdate('users', { id: `eq.${publicUser.id}` }, userPayload).catch((err) => {
        console.warn('[Supabase] users update failed:', err.message)
      })
    } else {
      try {
        await restInsert('users', userPayload)
      } catch (err) {
        console.warn('[Supabase] users insert failed, resolving conflict:', err.message)
        const conflictUser = (await restSelect('users', { select: '*', email: `eq.${email}` }).catch(() => []))[0]
          || (await restSelect('users', { select: '*', phone: `eq.${rawMobile}` }).catch(() => []))[0]
        if (conflictUser?.id) {
          userId = conflictUser.id
          userPayload.id = userId
          farmerPayload.user_id = userId
          await restUpdate('users', { id: `eq.${userId}` }, userPayload).catch(() => {})
        }
      }
    }

    // 4. Persist farmers table (safely update or insert)
    if (farmer?.id) {
      await restUpdate('farmers', { id: `eq.${farmer.id}` }, farmerPayload).catch((err) => {
        console.warn('[Supabase] farmers update failed:', err.message)
      })
    } else {
      try {
        await restInsert('farmers', farmerPayload)
      } catch (err) {
        console.warn('[Supabase] farmers insert failed, resolving conflict:', err.message)
        const conflictFarmer = (await restSelect('farmers', { select: '*', mobile: `eq.${rawMobile}` }).catch(() => []))[0]
          || (await restSelect('farmers', { select: '*', user_id: `eq.${userId}` }).catch(() => []))[0]
        if (conflictFarmer?.id) {
          farmerId = conflictFarmer.id
          await restUpdate('farmers', { id: `eq.${farmerId}` }, farmerPayload).catch(() => {})
        }
      }
    }

    const sessionUser = {
      id: farmerId,
      uid: authData?.localId || `usr-fb-${Date.now()}`,
      userId,
      name: payload.fullName,
      mobile: rawMobile,
      village: payload.village,
      farmerId,
      language: payload.language || 'en',
      status: 'active',
      email: payload.email || email,
      idToken: authData?.idToken || `token-${Date.now()}`,
      refreshToken: authData?.refreshToken || `ref-${Date.now()}`,
      lastLoginAt: new Date().toISOString(),
    }

    return storeUser(sessionUser)
  }

  async function loadSlotRows(centreCode, cropId, dateValue) {
    const centres = await restSelect('centres', { select: '*', code: `eq.${centreCode}` })
    const centre = centres[0]
    if (!centre) return []

    const params = { select: '*', centre_id: `eq.${centre.id}`, slot_date: `eq.${dateValue}` }
    if (/^\d+$/.test(String(cropId || ''))) params.crop_id = `eq.${cropId}`
    const rows = await restSelect('slots', params)

    if (/^\d+$/.test(String(cropId || ''))) return rows

    const byTime = new Map()
    rows.forEach((row) => {
      if (!byTime.has(row.slot_time)) byTime.set(row.slot_time, row)
    })
    return [...byTime.values()]
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  async function refreshBookedCount(slotId) {
    if (!slotId || !UUID_REGEX.test(String(slotId))) return
    try {
      const slotRows = await restSelect('slots', { select: '*', id: `eq.${slotId}` })
      const slot = slotRows[0]
      if (!slot) return
      const centreRows = await restSelect('centres', { select: '*', id: `eq.${slot.centre_id}` })
      const centreCode = centreRows[0]?.code
      const procurements = await restSelect('procurements', { select: 'token_id,crop' })
      const procurementByToken = Object.fromEntries(procurements.map((row) => [row.token_id, row]))
      const cropRows = await restSelect('crops', { select: '*', id: `eq.${slot.crop_id}` })
      const cropName = cropRows[0]?.name
      const tokens = await restSelect('queue_tokens', { select: '*', centre_id: `eq.${centreCode}`, slot_date: `eq.${slot.slot_date}`, slot_time: `eq.${slot.slot_time}` })
      const count = tokens.filter((row) => ['waiting', 'serving'].includes(row.queue_status) && String(procurementByToken[row.id]?.crop || '').toLowerCase() === String(cropName || '').toLowerCase()).length
      await restUpdate('slots', { id: `eq.${slotId}` }, { booked_count: count })
    } catch {
      // Ignore if slots table is not in use
    }
  }

  async function refreshSlotCountForBooking(booking) {
    if (!booking?.centreId || !booking?.date || !booking?.slot || !booking?.cropId) return
    try {
      const centres = await restSelect('centres', { select: '*', code: `eq.${booking.centreId}` })
      const centre = centres[0]
      if (!centre) return
      const slots = await restSelect('slots', { select: '*', centre_id: `eq.${centre.id}`, crop_id: `eq.${booking.cropId}`, slot_date: `eq.${booking.date}`, slot_time: `eq.${booking.slot}` })
      if (slots[0]) await refreshBookedCount(slots[0].id)
    } catch {}
  }

  async function ensureFarmerRecordExists(targetFarmerId) {
    const session = getStoredUser() || {}
    const candidateId = targetFarmerId || session.farmerId || session.id || ''

    // 1. Try finding in farmers table by ID
    if (candidateId) {
      const byId = await restSelect('farmers', { select: '*', id: `eq.${candidateId}` }).catch(() => [])
      if (byId[0]?.id) return byId[0].id
    }

    // 2. Try finding by mobile or user_id
    const mobile = session.mobile || String(candidateId).replace(/\D/g, '')
    if (mobile) {
      const byMobile = await restSelect('farmers', { select: '*', mobile: `eq.${mobile}` }).catch(() => [])
      if (byMobile[0]?.id) {
        session.farmerId = byMobile[0].id
        storeUser(session)
        return byMobile[0].id
      }
    }
    if (session.userId) {
      const byUserId = await restSelect('farmers', { select: '*', user_id: `eq.${session.userId}` }).catch(() => [])
      if (byUserId[0]?.id) {
        session.farmerId = byUserId[0].id
        storeUser(session)
        return byUserId[0].id
      }
    }

    // 3. Ensure a valid user row exists in users table first
    let userId = session.userId || (candidateId && !candidateId.startsWith('FRM-') ? candidateId : '')
    if (!userId) {
      userId = await nextId('users', 'id', 'usr-f')
      session.userId = userId
    }
    const userRow = (await restSelect('users', { select: 'id', id: `eq.${userId}` }).catch(() => []))[0]
    if (!userRow) {
      const userEmail = session.email || `${mobile || 'farmer'}@farmers.queuekisan.in`
      await restInsert('users', {
        id: userId,
        email: userEmail,
        phone: mobile || '',
        password_hash: 'password123',
        role: 'FARMER',
      }).catch(async () => {
        const conflict = (await restSelect('users', { select: 'id', email: `eq.${userEmail}` }).catch(() => []))[0]
          || (await restSelect('users', { select: 'id', phone: `eq.${mobile}` }).catch(() => []))[0]
        if (conflict?.id) userId = conflict.id
      })
    }

    // 4. Create farmer row in farmers table (without non-existent email column)
    const finalFarmerId = candidateId && String(candidateId).startsWith('FRM-')
      ? candidateId
      : await nextId('farmers', 'id', 'FRM-')

    const farmerPayload = {
      id: finalFarmerId,
      user_id: userId,
      name: session.name || 'Farmer',
      mobile: mobile || '',
      village: session.village || 'Ahmednagar',
      taluka: session.village || 'Ahmednagar',
      district: 'Ahmednagar',
      registered_date: localIsoDate(),
    }

    let resolvedId = finalFarmerId
    try {
      await restInsert('farmers', farmerPayload)
    } catch (err) {
      console.warn('[KrushiAPI] farmer insert fallback:', err.message)
      const existing = (await restSelect('farmers', { select: 'id', mobile: `eq.${mobile}` }).catch(() => []))[0]
        || (await restSelect('farmers', { select: 'id', user_id: `eq.${userId}` }).catch(() => []))[0]
      if (existing?.id) resolvedId = existing.id
    }

    session.farmerId = resolvedId
    storeUser(session)
    return resolvedId
  }

  async function createQueueArtifacts({ farmerId, centreId, cropId, slotId, slotDate, slotTime, quantityKg }) {
    const validFarmerId = await ensureFarmerRecordExists(farmerId)
    const centreRows = await restSelect('procurement_centers', { select: '*', id: `eq.${centreId}` })
    const centre = centreRows[0]
    if (!centre) throw new Error('Procurement centre not found.')

    let slot = null
    if (slotId && UUID_REGEX.test(String(slotId))) {
      try {
        const slotRows = await restSelect('slots', { select: '*', id: `eq.${slotId}` })
        slot = slotRows[0] || null
      } catch {
        slot = null
      }
    }

    if (!slot) {
      const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(String(slotId || ''))
      const resolvedDate = slotDate || (dateMatch ? dateMatch[1] : localIsoDate())
      const timeMap = {
        'm1': '09:00 AM - 10:00 AM',
        'm2': '10:00 AM - 11:00 AM',
        'm3': '11:00 AM - 12:00 PM',
        'a1': '01:00 PM - 02:00 PM',
        'a2': '02:00 PM - 03:00 PM',
        'a3': '03:00 PM - 04:00 PM',
        'e1': '04:00 PM - 05:00 PM',
        'e2': '05:00 PM - 06:00 PM',
      }
      const codeMatch = /slot-([a-z]\d)/i.exec(String(slotId || ''))
      const resolvedTime = slotTime || (codeMatch ? timeMap[codeMatch[1].toLowerCase()] : null) || '10:00 AM - 11:00 AM'

      slot = {
        id: slotId || `slot-${resolvedDate}`,
        slot_date: resolvedDate,
        slot_time: resolvedTime,
        booked_count: 0,
        capacity: 50,
      }
    }

    if (Number(slot.booked_count || 0) >= Number(slot.capacity || 0)) throw new Error('Selected slot is already full.')

    const existingBookings = await getAllBookingsForFarmer(validFarmerId)
    const duplicate = existingBookings.find((row) =>
      row.centreId === centreId &&
      row.date === slot.slot_date &&
      row.slot === slot.slot_time &&
      !['completed', 'skipped', 'no-show', 'cancelled'].includes(row.queueStatus)
    )
    if (duplicate) throw new Error('You have already booked this specific time slot. Please choose another time slot.')

    const cropName = /^\d+$/.test(String(cropId || ''))
      ? (await restSelect('crops', { select: '*', id: `eq.${cropId}` }))[0]?.name
      : (JSON.parse(sessionStorage.getItem('booking_crop') || '{}').name || 'Other Crop')

    const allTokens = await restSelect('queue_tokens', { select: 'id,token_number,slot_date,slot_time,centre_id,queue_status,check_in_status' })
    const nextBookingId = `BK-${Date.now().toString().slice(-6)}`
    const nextTokenNumber = `T-${String(
      allTokens
        .map((row) => Number(String(row.token_number || '').replace(/\D/g, '')))
        .filter((num) => !Number.isNaN(num))
        .reduce((max, num) => Math.max(max, num), 0) + 1,
    ).padStart(3, '0')}`
    const centreQueue = allTokens
      .filter((row) => row.centre_id === centreId && row.slot_date === slot.slot_date && row.queue_status === 'waiting')
      .sort((a, b) => {
        if (a.check_in_status === 'checked-in' && b.check_in_status !== 'checked-in') return -1
        if (a.check_in_status !== 'checked-in' && b.check_in_status === 'checked-in') return 1
        return String(a.slot_time || '').localeCompare(String(b.slot_time || ''))
      })

    const positionAhead = centreQueue.length
    await restInsert('queue_tokens', {
      id: nextBookingId,
      token_number: nextTokenNumber,
      farmer_id: validFarmerId,
      centre_id: centreId,
      counter_id: null,
      slot_date: slot.slot_date,
      slot_time: slot.slot_time,
      check_in_status: 'pending',
      verification_status: 'pending',
      queue_status: 'waiting',
      estimated_wait_time: positionAhead === 0 ? 'Now' : `${positionAhead * 10} min`,
      position_ahead: positionAhead,
    })

    await restInsert('procurements', {
      id: `PRC-${String(nextBookingId).replace(/[^A-Za-z0-9]/g, '')}`,
      token_id: nextBookingId,
      farmer_id: validFarmerId,
      centre_id: centreId,
      crop: cropName || 'Other Crop',
      variety: 'Standard',
      quantity: Number(quantityKg || 0),
      quality_grade: 'Pending Inspection',
      moisture_content: '',
      amount: 0,
      date: slot.slot_date,
      status: 'pending',
    })

    if (slot?.id && UUID_REGEX.test(String(slot.id))) {
      try {
        await restUpdate('slots', { id: `eq.${slot.id}` }, { booked_count: Number(slot.booked_count || 0) + 1 })
        await refreshBookedCount(slot.id)
      } catch (slotErr) {
        console.warn('[KrushiAPI] Could not update slot booked count:', slotErr?.message)
      }
    }

    const session = getStoredUser()
    if (session?.userId) {
      await restInsert('notifications', {
        user_id: session.userId,
        title: 'Token Generated',
        message: `Your token ${nextTokenNumber} is booked for ${centre.name}.`,
        read: false,
        type: 'success',
      })
    }

    requestQueueServer('/api/notifications/send-email', {
      method: 'POST',
      body: {
        to: session?.email && !session.email.endsWith('@farmers.local') ? session.email : undefined,
        type: 'booking_confirmation',
        data: {
          farmerName: session?.name || 'Farmer',
          tokenNumber: nextTokenNumber,
          crop: cropName,
          centre: centre.name,
          date: slot.slot_date,
          slot: slot.slot_time,
          bookingId: nextBookingId,
        },
      },
    }).catch(() => {})

    const booking = await getBookingById(nextBookingId)
    setActiveBookingId(nextBookingId)
    return booking
  }

  async function getBookingById(bookingId) {
    const rows = await restSelect('queue_tokens', { select: '*', id: `eq.${bookingId}` })
    const row = rows[0]
    if (!row) return null
    return normalizeBooking(row, await buildBookingContext(row))
  }

  async function getActiveOrLatestBooking(farmerId, preferredId = null) {
    const bookings = await getAllBookingsForFarmer(farmerId)
    const activeList = bookings.filter((row) => !['completed', 'skipped', 'no-show', 'cancelled'].includes(row.queueStatus))
    if (!activeList.length) {
      setActiveBookingId(null)
      return null
    }
    if (preferredId) {
      const match = activeList.find((b) => b.id === preferredId || b.bookingId === preferredId)
      if (match) {
        setActiveBookingId(match.id)
        return match
      }
    }
    const chosen = activeList[0]
    if (chosen?.id) setActiveBookingId(chosen.id)
    return chosen
  }

  async function getQueuePositionForBooking(booking) {
    if (!booking?.id) return { farmersAhead: 0, servingToken: '—', timeline: [], estimatedWaitMinutes: 0, predictedServiceMinutes: 0, predictionSource: 'historical-heuristic', predictionModel: 'historical-heuristic', loadCluster: 'Unclassified' }
    const rows = await restSelect('queue_tokens', { select: '*', centre_id: `eq.${booking.centreId}`, slot_date: `eq.${booking.date}` })
    const ordered = rows
      .filter((row) => ['waiting', 'serving', 'completed', 'skipped', 'no-show'].includes(row.queue_status))
      .sort((a, b) => {
        const priority = { serving: 0, waiting: 1, completed: 2, skipped: 3, 'no-show': 4 }
        const pa = priority[a.queue_status] ?? 9
        const pb = priority[b.queue_status] ?? 9
        if (pa !== pb) return pa - pb
        if (a.queue_status === 'waiting' && b.queue_status === 'waiting') {
          if (a.check_in_status === 'checked-in' && b.check_in_status !== 'checked-in') return -1
          if (a.check_in_status !== 'checked-in' && b.check_in_status === 'checked-in') return 1
        }
        return `${a.slot_date} ${a.slot_time}`.localeCompare(`${b.slot_date} ${b.slot_time}`)
      })
    const index = ordered.findIndex((row) => row.id === booking.id)
    const serving = ordered.find((row) => row.queue_status === 'serving')
    const activeBefore = ordered.slice(0, index).filter((row) => ['waiting', 'serving'].includes(row.queue_status))
    return {
      farmersAhead: booking.queueStatus === 'completed' ? 0 : Math.max(0, activeBefore.length),
      servingToken: serving?.token_number || '—',
      timeline: ordered.map((row) => row.token_number),
      estimatedWaitMinutes: Math.max(0, activeBefore.length * 10),
      predictedServiceMinutes: 0,
      predictionSource: 'historical-heuristic',
      predictionModel: 'historical-heuristic',
      loadCluster: 'Unclassified',
    }
  }

  const KrushiAPI = {
    async register(payload) {
      return createOrUpdateFarmerAccount(payload)
    },

    async login(mobile, password) {
      const match = await findUserAndFarmerByMobile(mobile)
      if (!match?.farmer || !match?.publicUser?.email) throw new Error('Farmer account not found. Please use a valid existing mobile number.')
      const authData = await ensureFirebaseSessionForExistingFarmer(match.publicUser, match.farmer, password)
      const user = storeUser({
        id: match.farmer.id,
        uid: authData.localId,
        userId: match.publicUser.id,
        name: match.farmer.name,
        mobile: match.farmer.mobile,
        village: match.farmer.village,
        farmerId: match.farmer.id,
        language: 'en',
        status: 'active',
        email: match.publicUser.email,
        idToken: authData.idToken,
        refreshToken: authData.refreshToken,
        lastLoginAt: new Date().toISOString(),
      })
      return { success: true, user }
    },

    async forgotPassword(mobile) {
      const match = await findUserAndFarmerByMobile(mobile)
      if (!match?.publicUser?.email) throw new Error('No account found for this mobile number.')
      await firebaseResetPassword(match.publicUser.email)
      return { success: true, message: `Password reset link sent to ${match.publicUser.email}.` }
    },

    logout() {
      localStorage.setItem(LAST_LOGOUT_KEY, new Date().toISOString())
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(ACTIVE_BOOKING_KEY)
      window.location.href = 'login.html'
    },

    isLoggedIn() {
      return !!getStoredUser()
    },

    getCurrentUser() {
      return getStoredUser()
    },

    async getPaymentProfile() {
      const farmerId = await this.getCurrentUserId()
      return getPaymentProfileForFarmer(farmerId)
    },

    async savePaymentProfile(profile) {
      const farmerId = await this.getCurrentUserId()
      return savePaymentProfileForFarmer(farmerId, profile)
    },

    async getCurrentUserId() {
      const user = getStoredUser()
      return user?.farmerId || null
    },

    setActiveBookingId,
    getActiveBookingId,

    async getCrops() {
      return restSelect('crops', { select: '*' })
    },

    async getCentres() {
      const [centres, centreMap, slots] = await Promise.all([
        restSelect('procurement_centers', { select: '*' }),
        getCentreMap(),
        restSelect('slots', { select: '*' }),
      ])
      const today = localIsoDate()
      return centres.map((centre) => {
        const centreUuid = centreMap[centre.id]?.id
        const centreSlots = slots.filter((slot) => slot.centre_id === centreUuid && slot.slot_date >= today)
        const available = centreSlots.filter((slot) => Number(slot.booked_count || 0) < Number(slot.capacity || 0)).length
        return {
          id: centre.id,
          name: centre.name,
          location: `${centre.taluka}, ${centre.district}`,
          status: centre.status,
          capacity: Number(centre.capacity || 0),
          availableSlots: available,
          crowdLevel: available < 5 ? 'High' : available < 15 ? 'Moderate' : 'Low',
        }
      })
    },

    async getSlots(centreId, cropId, dateValue) {
      return loadSlotRows(centreId, cropId, dateValue)
    },

    async createBooking({ centreId, cropId, slotId, slotDate, slotTime, quantityKg }) {
      const farmerId = await this.getCurrentUserId()
      if (!farmerId) throw new Error('Please sign in to continue.')
      try {
        const result = await requestQueueServer('/api/bookings/create', {
          method: 'POST',
          body: { farmerId, centreId, cropId, slotId, slotDate, slotTime, quantityKg },
        })
        if (result?.booking?.id) setActiveBookingId(result.booking.id)
        return result.booking
      } catch (error) {
        return createQueueArtifacts({ farmerId, centreId, cropId, slotId, slotDate, slotTime, quantityKg })
      }
    },

    async getActiveBooking(preferredId) {
      const farmerId = await this.getCurrentUserId()
      if (!farmerId) return null
      const targetId = preferredId || getActiveBookingId()
      try {
        const url = targetId
          ? `/api/bookings/active/${encodeURIComponent(farmerId)}?bookingId=${encodeURIComponent(targetId)}`
          : `/api/bookings/active/${encodeURIComponent(farmerId)}`
        const result = await requestQueueServer(url)
        if (result?.booking?.id) {
          setActiveBookingId(result.booking.id)
          return result.booking
        }
      } catch {}
      return getActiveOrLatestBooking(farmerId, targetId)
    },

    async getActiveBookings() {
      const farmerId = await this.getCurrentUserId()
      if (!farmerId) return []
      try {
        const result = await requestQueueServer(`/api/bookings/active-all/${encodeURIComponent(farmerId)}`)
        if (Array.isArray(result?.bookings) && result.bookings.length > 0) {
          return result.bookings
        }
      } catch {}
      const all = await getAllBookingsForFarmer(farmerId)
      return all.filter((row) => !['completed', 'skipped', 'no-show', 'cancelled'].includes(row.queueStatus))
    },

    async getQueuePosition(booking) {
      if (!booking?.id) return getQueuePositionForBooking(booking)
      try {
        return await requestQueueServer(`/api/bookings/position/${encodeURIComponent(booking.id)}`)
      } catch {
        return getQueuePositionForBooking(booking)
      }
    },

    async getBookingHistory() {
      const farmerId = await this.getCurrentUserId()
      if (!farmerId) return []
      return getAllBookingsForFarmer(farmerId)
    },

    async checkInBooking(bookingId) {
      try {
        const result = await requestQueueServer('/api/bookings/check-in', {
          method: 'POST',
          body: { bookingId },
        })
        setActiveBookingId(bookingId)
        return result.booking
      } catch {
        await restUpdate('queue_tokens', { id: `eq.${bookingId}` }, { check_in_status: 'checked-in', verification_status: 'completed' })
        const session = getStoredUser()
        const booking = await getBookingById(bookingId)
        if (session?.userId && booking) {
          await restInsert('notifications', {
            user_id: session.userId,
            title: 'Check-in confirmed',
            message: `Check-in completed for token ${booking.tokenNumber}.`,
            read: false,
            type: 'success',
          })
        }
        setActiveBookingId(bookingId)
        return booking
      }
    },

    async cancelBooking(bookingId) {
      const booking = await getBookingById(bookingId)
      await restUpdate('queue_tokens', { id: `eq.${bookingId}` }, { queue_status: 'skipped' })
      if (booking) await refreshSlotCountForBooking(booking)
      const session = getStoredUser()
      if (session?.userId && booking) {
        await restInsert('notifications', {
          user_id: session.userId,
          title: 'Booking cancelled',
          message: `Token ${booking.tokenNumber} has been cancelled successfully.`,
          read: false,
          type: 'warning',
        })
      }
      return { success: true }
    },

    async getNotifications() {
      const session = getStoredUser()
      if (!session?.userId) return []
      const rows = await restSelect('notifications', { select: '*', user_id: `eq.${session.userId}`, order: 'created_at.desc' })
      return rows.map((item) => ({ ...item, time: item.created_at }))
    },

    async markNotificationRead(id) {
      return restUpdate('notifications', { id: `eq.${id}` }, { read: true })
    },

    async markAllNotificationsRead() {
      const session = getStoredUser()
      if (!session?.userId) return { success: true }
      return restUpdate('notifications', { user_id: `eq.${session.userId}` }, { read: true })
    },
  }

  function guardAuthenticatedPage() {
    const pathname = window.location?.pathname || ''
    const page = (pathname.split('/').pop() || 'index.html').toLowerCase()
    const publicPages = new Set(['login.html', 'register.html'])
    if (!publicPages.has(page) && !getStoredUser()) {
      window.location.href = 'login.html'
    }
  }

  window.KrushiAPI = KrushiAPI
  guardAuthenticatedPage()
})()
