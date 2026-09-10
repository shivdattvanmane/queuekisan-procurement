import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, 'scripts', '.env')

function parseEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    out[key] = value
  }
  return out
}

const env = parseEnv(envPath)
const SUPABASE_URL = env.VITE_SUPABASE_URL.replace(/\/$/, '')
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const SECRET_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const FIREBASE_API_KEY = env.VITE_FIREBASE_API_KEY
const REST_BASE = `${SUPABASE_URL}/rest/v1`
const FIREBASE_BASE = 'https://identitytoolkit.googleapis.com/v1'
const today = new Date().toISOString().slice(0, 10)
const suffix = Date.now().toString(36).toUpperCase().slice(-6)

const report = {
  startedAt: new Date().toISOString(),
  tempIds: {},
  checks: [],
}
const runtimeTemp = {}

function note(name, ok, details = {}) {
  report.checks.push({ name, ok, details })
  const icon = ok ? '✅' : '❌'
  console.log(icon, name, Object.keys(details).length ? JSON.stringify(details) : '')
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
    const error = new Error(data?.error?.message || data?.message || data?.detail || text || 'Request failed')
    error.status = response.status
    error.payload = data
    throw error
  }
  return data
}

async function rest(method, table, { params = {}, body, secret = false } = {}) {
  const url = new URL(`${REST_BASE}/${table}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })
  const key = secret ? SECRET_KEY : ANON_KEY
  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return parseResponse(response)
}

const restGet = (table, params = {}, secret = true) => rest('GET', table, { params, secret })
const restPost = (table, body, secret = true) => rest('POST', table, { body, secret })
const restPatch = (table, params, body, secret = true) => rest('PATCH', table, { params, body, secret })
const restDelete = (table, params, secret = true) => rest('DELETE', table, { params, secret })

async function firebase(pathName, body) {
  const response = await fetch(`${FIREBASE_BASE}/${pathName}?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}

function makeStorage() {
  const map = new Map()
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  }
}

async function loadFarmerApi() {
  const code = fs.readFileSync(path.join(root, 'farmer', 'js', 'krushiApi.js'), 'utf8')
  const localStorage = makeStorage()
  const sessionStorage = makeStorage()
  const ctx = {
    window: {
      KRUSHI_SUPABASE_URL: SUPABASE_URL,
      KRUSHI_SUPABASE_ANON_KEY: ANON_KEY,
      KRUSHI_FIREBASE_API_KEY: FIREBASE_API_KEY,
      KRUSHI_FIREBASE_BASE: FIREBASE_BASE,
      location: { href: '', protocol: 'http:' },
    },
    localStorage,
    sessionStorage,
    fetch,
    console,
    URL,
    Date,
    setTimeout,
    clearTimeout,
  }
  ctx.window.localStorage = localStorage
  ctx.window.sessionStorage = sessionStorage
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  return { api: ctx.window.KrushiAPI, localStorage, sessionStorage }
}

function findPackageRoot(startPath) {
  let dir = path.dirname(startPath)
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    dir = path.dirname(dir)
  }
  throw new Error(`Unable to find package.json for ${startPath}`)
}

function buildBundle(sourcePath, outfile, defines) {
  const packageRoot = findPackageRoot(sourcePath)
  const esbuildPath = path.join(packageRoot, 'node_modules', '.bin', 'esbuild')
  const args = [sourcePath, '--bundle', '--platform=node', '--format=cjs', `--outfile=${outfile}`]
  Object.entries(defines).forEach(([key, value]) => {
    args.push(`--define:${key}=${JSON.stringify(value)}`)
  })
  execFileSync(esbuildPath, args, {
    cwd: packageRoot,
    stdio: 'pipe',
  })
}

async function loadCounterApi() {
  const source = path.join(root, 'counter', 'src', 'services', 'queueApi.js')
  const outfile = path.join(root, 'counter', '.tmp-queueApi.cjs')
  buildBundle(source, outfile, {
    'import.meta.env.VITE_SUPABASE_URL': SUPABASE_URL,
    'import.meta.env.VITE_SUPABASE_ANON_KEY': ANON_KEY,
    'import.meta.env.VITE_FIREBASE_API_KEY': FIREBASE_API_KEY,
    'import.meta.env.VITE_QUEUE_SERVER_URL': 'http://127.0.0.1:8000',
  })
  global.localStorage = makeStorage()
  const mod = await import(`file://${outfile}?t=${Date.now()}`)
  return { mod, cleanup: () => { try { fs.unlinkSync(outfile) } catch {} } }
}

async function loadAdminApi() {
  const source = path.join(root, 'admin', 'src', 'services', 'adminApi.js')
  const outfile = path.join(root, 'admin', '.tmp-adminApi.cjs')
  buildBundle(source, outfile, {
    'import.meta.env.VITE_SUPABASE_URL': SUPABASE_URL,
    'import.meta.env.VITE_SUPABASE_ANON_KEY': ANON_KEY,
    'import.meta.env.VITE_FIREBASE_API_KEY': FIREBASE_API_KEY,
    'import.meta.env.VITE_QUEUE_SERVER_URL': 'http://127.0.0.1:8000',
  })
  const mod = await import(`file://${outfile}?t=${Date.now()}`)
  return { mod, cleanup: () => { try { fs.unlinkSync(outfile) } catch {} } }
}

async function cleanupTempResources() {
  const ids = report.tempIds
  const quiet = async (fn) => { try { await fn() } catch {} }
  async function deleteFirebaseUser(email, password) {
    if (!email || !password) return
    await quiet(async () => {
      const auth = await firebase('accounts:signInWithPassword', { email, password, returnSecureToken: true })
      await firebase('accounts:delete', { idToken: auth.idToken })
    })
  }
  if (ids.tempPublicUserId) {
    await quiet(() => restDelete('notifications', { user_id: `eq.${ids.tempPublicUserId}` }))
  }
  if (ids.tempPaymentId) {
    await quiet(() => restDelete('payment_status_history', { payment_id: `eq.${ids.tempPaymentId}` }))
    await quiet(() => restDelete('payments', { id: `eq.${ids.tempPaymentId}` }))
  }
  if (ids.tempProcurementId) {
    await quiet(() => restDelete('procurements', { id: `eq.${ids.tempProcurementId}` }))
  }
  if (ids.tempBookingId) {
    await quiet(() => restDelete('queue_tokens', { id: `eq.${ids.tempBookingId}` }))
  }
  if (ids.tempSlotId) {
    await quiet(() => restDelete('slots', { id: `eq.${ids.tempSlotId}` }))
  }
  if (ids.tempCounterId) {
    await quiet(() => restDelete('counters', { id: `eq.${ids.tempCounterId}` }))
  }
  if (ids.tempFarmerId) {
    await quiet(() => restDelete('farmers', { id: `eq.${ids.tempFarmerId}` }))
  }
  if (ids.tempCounterOfficerId) {
    await quiet(() => restDelete('users', { id: `eq.${ids.tempCounterOfficerId}` }))
  }
  if (ids.tempPublicUserId) {
    await quiet(() => restDelete('users', { id: `eq.${ids.tempPublicUserId}` }))
  }
  if (ids.tempCentreUuid) {
    await quiet(() => restDelete('centres', { id: `eq.${ids.tempCentreUuid}` }))
  }
  if (ids.tempCentreCode) {
    await quiet(() => restDelete('procurement_centers', { id: `eq.${ids.tempCentreCode}` }))
  }
  await deleteFirebaseUser(runtimeTemp.tempCounterEmail, runtimeTemp.tempCounterPassword)
  await deleteFirebaseUser(runtimeTemp.tempFarmerEmail, runtimeTemp.tempFarmerPassword)
}

try {
  const farmerHarness = await loadFarmerApi()
  const { api: farmerApi } = farmerHarness

  // Existing real-user auth smoke checks
  const adminUser = (await restGet('users', { select: '*', id: 'eq.usr-a001', role: 'eq.ADMIN' }))[0]
  const adminAuth = await firebase('accounts:signInWithPassword', {
    email: adminUser.email,
    password: adminUser.password_hash,
    returnSecureToken: true,
  })
  note('Real admin Firebase login', !!adminAuth.idToken, { adminId: adminUser.id })

  const counterUser = (await restGet('users', { select: '*', id: 'eq.usr-c001', role: 'eq.COUNTER_PERSON' }))[0]
  const counterAuth = await firebase('accounts:signInWithPassword', {
    email: counterUser.email,
    password: counterUser.password_hash,
    returnSecureToken: true,
  })
  note('Real counter Firebase login', !!counterAuth.idToken, { officerId: counterUser.id })

  const farmerLoginExisting = await farmerApi.login('9876543210', 'pass123')
  note('Real farmer login via app service', farmerLoginExisting.success === true, {
    farmerId: farmerLoginExisting.user.farmerId,
    mobile: farmerLoginExisting.user.mobile,
  })

  // Create temp centre and counter officer
  const tempCentreCode = `CTR-T${suffix}`
  report.tempIds.tempCentreCode = tempCentreCode
  const centreRow = await restPost('procurement_centers', {
    id: tempCentreCode,
    name: `QueueKisan Test Centre ${suffix}`,
    address: 'Arena QA Yard',
    taluka: 'Pune',
    district: 'Pune',
    status: 'active',
    capacity: 25,
    contact: '0000000000',
    coordinates: '18.5204 N, 73.8567 E',
  })
  note('Create temp procurement centre', Array.isArray(centreRow) && centreRow[0]?.id === tempCentreCode)

  const mappedCentre = await restPost('centres', {
    name: `QueueKisan Test Centre ${suffix}`,
    code: tempCentreCode,
    location: 'Pune',
  })
  report.tempIds.tempCentreUuid = mappedCentre[0].id
  note('Create temp scheduling centre mapping', !!report.tempIds.tempCentreUuid)

  const tempSlot = await restPost('slots', {
    centre_id: report.tempIds.tempCentreUuid,
    crop_id: 3,
    slot_date: today,
    slot_time: '05:00 PM - 06:00 PM',
    capacity: 5,
    booked_count: 0,
  })
  report.tempIds.tempSlotId = tempSlot[0].id
  note('Create temp slot', !!report.tempIds.tempSlotId, { slotTime: '05:00 PM - 06:00 PM' })

  const tempCounterOfficerId = `OFF-T${suffix}`
  const tempCounterEmail = `officer.${suffix.toLowerCase()}@queuekisan.test`
  const tempCounterPassword = 'Officer123!'
  runtimeTemp.tempCounterEmail = tempCounterEmail
  runtimeTemp.tempCounterPassword = tempCounterPassword
  report.tempIds.tempCounterOfficerId = tempCounterOfficerId
  report.tempIds.tempCounterEmail = tempCounterEmail
  await firebase('accounts:signUp', { email: tempCounterEmail, password: tempCounterPassword, returnSecureToken: true })
  await restPost('users', {
    id: tempCounterOfficerId,
    email: tempCounterEmail,
    phone: tempCounterOfficerId,
    password_hash: tempCounterPassword,
    role: 'COUNTER_PERSON',
  })
  const tempCounterId = `CNT-T${suffix}`
  report.tempIds.tempCounterId = tempCounterId
  await restPost('counters', {
    id: tempCounterId,
    centre_id: tempCentreCode,
    counter_number: 'Counter QA',
    officer_id: tempCounterOfficerId,
    status: 'active',
  })
  const officerAuth = await firebase('accounts:signInWithPassword', {
    email: tempCounterEmail,
    password: tempCounterPassword,
    returnSecureToken: true,
  })
  note('Counter Firebase login', !!officerAuth.idToken, { officerId: tempCounterOfficerId })

  // Farmer register/login and booking flow via farmer app code
  const tempMobile = `98${String(Date.now()).slice(-8)}`
  const tempFarmerPassword = 'pass123'
  runtimeTemp.tempFarmerEmail = `${tempMobile}@farmers.local`
  runtimeTemp.tempFarmerPassword = tempFarmerPassword
  const tempUser = await farmerApi.register({
    fullName: `Arena Farmer ${suffix}`,
    mobile: tempMobile,
    password: tempFarmerPassword,
    farmerId: '',
    village: 'Pune',
    language: 'en',
  })
  report.tempIds.tempFarmerId = tempUser.farmerId
  report.tempIds.tempPublicUserId = tempUser.userId
  note('Farmer registration via app service', !!tempUser.farmerId, { farmerId: tempUser.farmerId, mobile: tempMobile })

  const farmerLogin = await farmerApi.login(tempMobile, tempFarmerPassword)
  note('Farmer login via app service', farmerLogin.success === true, { farmerId: farmerLogin.user.farmerId })

  const centres = await farmerApi.getCentres()
  const foundCentre = centres.find((centre) => centre.id === tempCentreCode)
  note('Farmer sees temp centre', !!foundCentre, { centresCount: centres.length })

  const slots = await farmerApi.getSlots(tempCentreCode, 3, today)
  const foundSlot = slots.find((slot) => slot.id === report.tempIds.tempSlotId)
  note('Farmer sees temp slot', !!foundSlot, { slotsFound: slots.length })

  const booking = await farmerApi.createBooking({
    centreId: tempCentreCode,
    cropId: 3,
    slotId: report.tempIds.tempSlotId,
    quantityKg: 120,
  })
  report.tempIds.tempBookingId = booking.id
  report.tempIds.tempProcurementId = `PRC-${String(booking.id).replace(/[^A-Za-z0-9]/g, '')}`
  note('Farmer creates booking', !!booking.id, { bookingId: booking.id, token: booking.tokenNumber })

  const activeAfterCreate = await farmerApi.getActiveBooking()
  note('Farmer active booking loads', activeAfterCreate?.id === booking.id, {
    queueStatus: activeAfterCreate?.queueStatus,
    predictionSource: activeAfterCreate?.predictionSource,
    loadCluster: activeAfterCreate?.loadCluster,
  })

  const queuePosBefore = await farmerApi.getQueuePosition(activeAfterCreate)
  note('Farmer queue position loads', typeof queuePosBefore.farmersAhead === 'number', queuePosBefore)
  note('Farmer queue prediction metadata available', !!queuePosBefore.predictionSource && 'loadCluster' in queuePosBefore, {
    predictionSource: queuePosBefore.predictionSource,
    loadCluster: queuePosBefore.loadCluster,
    predictionModel: queuePosBefore.predictionModel,
  })

  const checkedIn = await farmerApi.checkInBooking(booking.id)
  note('Farmer check-in updates status', checkedIn?.checkIn === 'checked-in', { verificationStatus: checkedIn?.status })

  // Counter flow via counter app service
  const counterBundle = await loadCounterApi()
  global.localStorage.setItem('queuekisan_counter_session', JSON.stringify({ id: tempCounterOfficerId, role: 'counter' }))
  const counterApi = counterBundle.mod

  const queueBeforeCall = await counterApi.getQueue()
  note('Counter queue loads', Array.isArray(queueBeforeCall.queue) && queueBeforeCall.queue.some((row) => row.id === booking.id), { queueSize: queueBeforeCall.queue.length })

  const called = await counterApi.callNextToken()
  note('Counter call-next works', called.farmer?.id === booking.id && called.farmer?.queueStatus === 'serving', { token: called.farmer?.token })

  const verified = await counterApi.verifyFarmer(booking.id)
  note('Counter verify farmer works', verified.farmer?.checkIn === 'checked-in', { bookingId: verified.farmer?.bookingId })

  const produce = await counterApi.submitProduceEntry(booking.id, {
    crop: 'Wheat',
    quantity: 120,
    unit: 'kg',
    quality: 'Grade A',
    moisture: '12',
    remarks: 'Arena QA produce entry',
  })
  note('Counter produce entry works', produce.farmer?.id === booking.id)

  const started = await counterApi.startProcurement(booking.id)
  note('Counter procurement start works', started.farmer?.procurementStatus === 'in-progress', { status: started.farmer?.procurementStatus })

  const amountConfirmed = await counterApi.confirmAmount(booking.id, {
    amount: 5400,
    quality: 'Grade A',
  })
  note('Counter confirm amount works', Number(amountConfirmed.farmer?.amount) === 5400, { amount: amountConfirmed.farmer?.amount })

  const completed = await counterApi.completeProcurement(booking.id, {
    amount: 5400,
    quality: 'Grade A',
  })
  report.tempIds.tempPaymentId = `PAY-${String(report.tempIds.tempProcurementId).replace(/[^A-Za-z0-9]/g, '')}`
  note('Counter completes procurement', completed.farmer?.queueStatus === 'completed' && completed.farmer?.procurementStatus === 'completed', { paymentStatus: completed.farmer?.paymentStatus })

  const paymentUpdated = await counterApi.updatePayment(booking.id, {
    status: 'completed',
    referenceId: `REF-${suffix}`,
    amount: 5400,
    paymentDate: new Date().toISOString(),
  })
  note('Counter completes payment', paymentUpdated.farmer?.paymentStatus === 'completed', { referenceId: paymentUpdated.farmer?.referenceId })

  // Farmer post-processing view
  const activeAfterCompletion = await farmerApi.getActiveBooking()
  note('Farmer sees completed booking state', activeAfterCompletion?.id === booking.id && activeAfterCompletion?.paymentStatus === 'completed', {
    queueStatus: activeAfterCompletion?.queueStatus,
    procurementStatus: activeAfterCompletion?.procurementStatus,
    paymentStatus: activeAfterCompletion?.paymentStatus,
  })

  const farmerHistory = await farmerApi.getBookingHistory()
  note('Farmer history includes completed booking', farmerHistory.some((row) => row.id === booking.id && row.paymentStatus === 'completed'), { historyCount: farmerHistory.length })

  const farmerNotifications = await farmerApi.getNotifications()
  note('Farmer notifications generated', farmerNotifications.length > 0, { notifications: farmerNotifications.length })

  // Admin data services
  const adminBundle = await loadAdminApi()
  const adminApi = adminBundle.mod
  const kpis = await adminApi.getDashboardKPIs()
  note('Admin KPI service loads', typeof kpis.totalFarmers === 'number' && typeof kpis.activeQueue === 'number', kpis)

  const adminCentres = await adminApi.getCentres()
  note('Admin centres include temp centre', adminCentres.some((centre) => centre.id === tempCentreCode), { centresCount: adminCentres.length })

  const adminQueue = await adminApi.getQueueData()
  note('Admin queue service loads', Array.isArray(adminQueue) && adminQueue.length > 0, { queueCentres: adminQueue.length })

  const adminFarmers = await adminApi.getFarmers()
  note('Admin farmers include temp farmer', adminFarmers.some((farmer) => farmer.id === tempUser.farmerId), { farmersCount: adminFarmers.length })

  const adminBookings = await adminApi.getBookingHistoryFor(tempUser.farmerId)
  note('Admin farmer booking history loads', adminBookings.some((row) => row.bookingId === booking.id), { bookingRows: adminBookings.length })

  const adminProcurements = await adminApi.getProcurements()
  note('Admin procurement list includes temp procurement', adminProcurements.some((row) => row.id === report.tempIds.tempProcurementId), { procurementsCount: adminProcurements.length })

  const adminPayments = await adminApi.getPayments()
  note('Admin payments list includes temp payment', adminPayments.some((row) => row.referenceId === `REF-${suffix}` && row.status === 'completed'), { paymentsCount: adminPayments.length })

  const adminNotifications = await adminApi.getNotifications()
  note('Admin notifications load', adminNotifications.length > 0, { notifications: adminNotifications.length })

  const analytics = await adminApi.getAnalyticsBundle()
  note('Admin analytics load', Array.isArray(analytics?.analyticsData?.cropDistribution?.labels), {
    crops: analytics?.analyticsData?.cropDistribution?.labels?.length || 0,
  })
  note('Admin ML diagnostics available', !!analytics?.mlDiagnostics && typeof analytics.mlDiagnostics === 'object', {
    model: analytics?.mlDiagnostics?.model,
    clusterSamples: analytics?.mlDiagnostics?.clusterSamples,
    regressionSamples: analytics?.mlDiagnostics?.regressionSamples,
    queueEventCount: analytics?.mlDiagnostics?.queueEventCount,
    recordedLifecycleSamples: analytics?.mlDiagnostics?.recordedLifecycleSamples,
  })

  const reportBundle = await adminApi.getReportBundle(today.slice(0, 7))
  note('Admin reports load', Array.isArray(reportBundle?.centrePerformance), {
    centres: reportBundle?.centrePerformance?.length || 0,
  })

  adminBundle.cleanup()
  counterBundle.cleanup()
} catch (error) {
  note('E2E execution error', false, {
    message: error.message,
    status: error.status,
    payload: error.payload,
  })
} finally {
  try {
    await cleanupTempResources()
    note('Temporary test data cleanup', true, report.tempIds)
  } catch (cleanupError) {
    note('Temporary test data cleanup', false, { message: cleanupError.message })
  }
  report.finishedAt = new Date().toISOString()
  report.passed = report.checks.every((item) => item.ok)
  const reportPath = path.join(root, 'scripts', 'e2e-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`Report written to ${reportPath}`)
  if (!report.passed) process.exitCode = 1
}
