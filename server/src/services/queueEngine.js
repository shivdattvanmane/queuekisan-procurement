import crypto from 'crypto'
import { hasColumn, hasTable, restInsert, restRpc, restSelect, restUpdate } from '../lib/supabase.js'
import { buildAnalyticsBundle } from './analyticsEngine.js'
import { enrichQueueWithMlPredictions } from './mlService.js'
import { emailService } from './emailService.js'

function isSyntheticEmail(email) {
  if (!email) return true
  const lower = email.toLowerCase()
  return lower.endsWith('@farmers.local') || lower.endsWith('@farmers.queuekisan.in')
}

async function getFarmerEmail(farmerId, userId) {
  try {
    let candidate = null
    if (userId) {
      const users = await restSelect('users', { select: 'email,phone', id: `eq.${userId}` })
      if (users[0]?.email && !isSyntheticEmail(users[0].email)) {
        candidate = users[0].email
      }
    }
    if (!candidate && farmerId) {
      const farmers = await restSelect('farmers', { select: 'user_id', id: `eq.${farmerId}` })
      if (farmers[0]?.user_id) {
        const users = await restSelect('users', { select: 'email', id: `eq.${farmers[0].user_id}` })
        if (users[0]?.email && !isSyntheticEmail(users[0].email)) {
          candidate = users[0].email
        }
      }
    }
    if (candidate && candidate.includes('@') && candidate.includes('.')) {
      return candidate.trim()
    }
    // Fall back to configured sender email so administrator/farmer gets the alert
    if (process.env.EMAIL_USER && process.env.EMAIL_USER.includes('@')) {
      return process.env.EMAIL_USER.trim()
    }
  } catch (err) {
    console.error('[getFarmerEmail] error:', err.message)
  }
  return process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : null
}

const ACTIVE_QUEUE_STATUSES = new Set(['waiting', 'serving'])
const APPROACHING_THRESHOLD = Number(process.env.QUEUE_APPROACHING_THRESHOLD || 2)

function localIsoDate(value = new Date()) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function titleCase(value = '') {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatQuantity(value) {
  return Number(value || 0)
}

function formatWaitMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) return 'Now'
  return `${Math.round(value)} min`
}

function normalizeProcurementStatus(status) {
  return status || 'pending'
}

function shouldShowAtCounter(row, today) {
  if (!row?.slot_date) return false
  return row.slot_date >= today || ACTIVE_QUEUE_STATUSES.has(row.queue_status)
}

async function getPaymentProfilesByFarmer() {
  try {
    const enabled = await hasTable('farmer_payment_details')
    if (!enabled) return {}
    const rows = await restSelect('farmer_payment_details', { select: '*' })
    return Object.fromEntries(rows.map((row) => [row.farmer_id, {
      accountHolder: row.account_holder || '',
      bankName: row.bank_name || '',
      accountNumber: row.account_number || '',
      ifscCode: row.ifsc_code || '',
      upiId: row.upi_id || '',
    }]))
  } catch {
    return {}
  }
}

async function fetchBundle() {
  const queueEventsPromise = hasTable('queue_events')
    .then((enabled) => (enabled ? restSelect('queue_events', { select: '*', order: 'created_at.desc', limit: '5000' }) : []))
    .catch(() => [])

  const [centres, centreMapRows, farmers, users, tokens, procurements, payments, counters, notifications, slots, crops, queueEvents, paymentProfilesByFarmer] = await Promise.all([
    restSelect('procurement_centers', { select: '*' }),
    restSelect('centres', { select: '*' }),
    restSelect('farmers', { select: '*' }),
    restSelect('users', { select: '*' }),
    restSelect('queue_tokens', { select: '*' }),
    restSelect('procurements', { select: '*' }),
    restSelect('payments', { select: '*' }),
    restSelect('counters', { select: '*' }),
    restSelect('notifications', { select: '*', order: 'created_at.desc', limit: '100' }),
    restSelect('slots', { select: '*' }),
    restSelect('crops', { select: '*' }),
    queueEventsPromise,
    getPaymentProfilesByFarmer(),
  ])

  return {
    centres,
    centreMapRows,
    farmers,
    users,
    tokens,
    procurements,
    payments,
    counters,
    notifications,
    slots,
    crops,
    queueEvents,
    paymentProfilesByFarmer,
    procCentreById: Object.fromEntries(centres.map((row) => [row.id, row])),
    centreByUuid: Object.fromEntries(centreMapRows.map((row) => [row.id, row])),
    centreByCode: Object.fromEntries(centreMapRows.filter((row) => row.code).map((row) => [row.code, row])),
    farmerById: Object.fromEntries(farmers.map((row) => [row.id, row])),
    userById: Object.fromEntries(users.map((row) => [row.id, row])),
    procurementByToken: Object.fromEntries(procurements.map((row) => [row.token_id, row])),
    paymentByProcurement: Object.fromEntries(payments.map((row) => [row.procurement_id, row])),
  }
}

function normalizeQueueRow(row, bundle) {
  const farmer = bundle.farmerById[row.farmer_id]
  const procurement = bundle.procurementByToken[row.id]
  const payment = bundle.paymentByProcurement[procurement?.id]
  const rowCentre = bundle.procCentreById[row.centre_id] || null
  return {
    id: String(row.id),
    bookingId: String(row.id),
    bookingRowId: String(row.id),
    token: row.token_number,
    tokenNumber: row.token_number,
    farmerId: row.farmer_id,
    farmerName: farmer?.name || row.farmer_id,
    mobile: farmer?.mobile || '',
    village: farmer?.village || '',
    crop: procurement?.crop || 'Not recorded',
    quantityKg: formatQuantity(procurement?.quantity),
    quantityDisplay: `${formatQuantity(procurement?.quantity).toLocaleString('en-IN')} kg`,
    quantity: formatQuantity(procurement?.quantity),
    unit: 'kg',
    slot: row.slot_time,
    date: row.slot_date,
    centreId: row.centre_id,
    centreName: rowCentre?.name || row.centre_id,
    checkIn: row.check_in_status,
    verificationStatus: row.verification_status,
    queueStatus: row.queue_status,
    procurementStatus: normalizeProcurementStatus(procurement?.status),
    paymentStatus: payment?.status || 'pending',
    amount: Number(procurement?.amount || payment?.amount || 0),
    quality: procurement?.quality_grade || '',
    moisture: procurement?.moisture_content || '',
    remarks: procurement?.variety || procurement?.remarks || '',
    referenceId: payment?.reference_id || '',
    paymentDate: payment?.payment_date || '',
    paymentProfile: bundle.paymentProfilesByFarmer[row.farmer_id] || null,
    counterId: row.counter_id || '',
    userId: farmer?.user_id || '',
    bookedAt: row.booked_at || row.created_at || '',
    checkedInAt: row.checked_in_at || '',
    calledAt: row.called_at || '',
    serviceStartedAt: row.service_started_at || '',
    serviceCompletedAt: row.service_completed_at || '',
    raw: row,
  }
}

function sortQueueRows(queue) {
  return [...queue].sort((a, b) => {
    const priority = { serving: 0, waiting: 1, completed: 2, skipped: 3, 'no-show': 4 }
    const pa = priority[a.queueStatus] ?? 9
    const pb = priority[b.queueStatus] ?? 9
    if (pa !== pb) return pa - pb
    if (a.queueStatus === 'waiting' && b.queueStatus === 'waiting') {
      if (a.checkIn === 'checked-in' && b.checkIn !== 'checked-in') return -1
      if (a.checkIn !== 'checked-in' && b.checkIn === 'checked-in') return 1
    }
    return `${a.date} ${a.slot} ${a.bookedAt}`.localeCompare(`${b.date} ${b.slot} ${b.bookedAt}`)
  })
}

async function buildPredictedQueue(bundle, baseQueue) {
  const sortedQueue = sortQueueRows(baseQueue)
  return enrichQueueWithMlPredictions(sortedQueue, bundle)
}

async function writeQueueMetrics(queue) {
  const supportsEstimatedMinutes = await hasColumn('queue_tokens', 'estimated_wait_minutes')
  const supportsLastPredictionSource = await hasColumn('queue_tokens', 'last_prediction_source')
  for (const row of queue) {
    const payload = {
      position_ahead: Number(row.farmersAhead || 0),
      estimated_wait_time: row.queueStatus === 'completed' ? 'Done' : formatWaitMinutes(Number(row.estimatedWaitMinutes || 0)),
    }
    if (supportsEstimatedMinutes) payload.estimated_wait_minutes = Number(row.estimatedWaitMinutes || 0)
    if (supportsLastPredictionSource) payload.last_prediction_source = row.predictionSource || 'historical-heuristic'
    await restUpdate('queue_tokens', { id: `eq.${row.id}` }, payload)
  }
}

async function ensureQueueEvent(event) {
  if (!(await hasTable('queue_events'))) return
  await restInsert('queue_events', {
    token_id: event.tokenId,
    farmer_id: event.farmerId,
    centre_id: event.centreId,
    counter_id: event.counterId || null,
    event_type: event.eventType,
    old_status: event.oldStatus || null,
    new_status: event.newStatus || null,
    queue_position: event.farmersAhead ?? null,
    estimated_wait_minutes: event.estimatedWaitMinutes ?? null,
    metadata: event.metadata || {},
  })
}

async function ensureNotification(userId, title, message, type = 'info') {
  if (!userId) return null
  const recent = await restSelect('notifications', { select: '*', user_id: `eq.${userId}`, order: 'created_at.desc', limit: '20' })
  const duplicate = recent.find((item) => item.title === title && item.message === message)
  if (duplicate) return duplicate
  const inserted = await restInsert('notifications', { user_id: userId, title, message, read: false, type })
  return inserted[0] || null
}

async function issueApproachingNotifications(queue) {
  for (const row of queue) {
    if (row.queueStatus !== 'waiting' || row.farmersAhead <= 0 || row.farmersAhead > APPROACHING_THRESHOLD || !row.userId) continue
    const notif = await ensureNotification(
      row.userId,
      'Turn approaching',
      `Your token ${row.token} is approaching at ${row.centreName}. Only ${row.farmersAhead} farmer${row.farmersAhead > 1 ? 's are' : ' is'} ahead of you.`,
      'info',
    )
    if (notif) {
      getFarmerEmail(row.farmerId, row.userId).then((email) => {
        if (email) {
          emailService.sendApproachingAlertEmail({
            to: email,
            farmerName: row.farmerName,
            tokenNumber: row.token,
            centre: row.centreName,
            peopleAhead: row.farmersAhead,
            estimatedWait: row.estimatedWaitTime,
          }).catch((err) => console.error('[issueApproachingNotifications] email error:', err.message))
        }
      }).catch(() => {})
    }
  }
}

async function rebuildQueueForCentreDate(centreId, slotDate) {
  const bundle = await fetchBundle()
  const queue = bundle.tokens
    .filter((row) => row.centre_id === centreId && row.slot_date === slotDate)
    .map((row) => normalizeQueueRow(row, bundle))
  const predictionBundle = await buildPredictedQueue(bundle, queue)
  await writeQueueMetrics(predictionBundle.queue)
  await issueApproachingNotifications(predictionBundle.queue)
  return { bundle, queue: predictionBundle.queue, profiles: predictionBundle.profiles, diagnostics: predictionBundle.diagnostics }
}

async function getOfficerBundle(officerId) {
  const users = await restSelect('users', { select: '*', id: `eq.${String(officerId).trim()}`, role: 'eq.COUNTER_PERSON' })
  const officer = users[0]
  if (!officer) throw new Error('Counter account not found.')
  const counters = await restSelect('counters', { select: '*', officer_id: `eq.${officer.id}` })
  const counter = counters[0]
  if (!counter) throw new Error('No counter is assigned to this officer.')
  const centres = await restSelect('procurement_centers', { select: '*', id: `eq.${counter.centre_id}` })
  const centre = centres[0]
  if (!centre) throw new Error('Assigned centre not found.')
  return { officer, counter, centre }
}

async function buildQueueResponse(officerId) {
  const { officer, counter, centre } = await getOfficerBundle(officerId)
  const today = localIsoDate()
  const bundle = await fetchBundle()

  // Match centre identifiers (both ID and code)
  const centreMapping = bundle.centreMapRows.find(
    (c) => c.id === centre.id || c.code === centre.id || c.id === counter.centre_id || c.code === counter.centre_id
  )
  const centreCode = centreMapping?.code || centre.id
  const centreUuid = centreMapping?.id || centre.id

  const baseQueue = bundle.tokens
    .filter((row) => {
      // 1. Strict Centre Isolation: only show tokens belonging to this centre
      const matchesCentre = row.centre_id === centre.id || row.centre_id === centreCode || row.centre_id === centreUuid
      if (!matchesCentre) return false

      // 2. Strict Counter Isolation: if token is explicitly assigned to a counter, only show if it matches this counter
      if (row.counter_id && counter?.id && String(row.counter_id) !== String(counter.id)) {
        return false
      }

      return shouldShowAtCounter(row, today)
    })
    .map((row) => normalizeQueueRow(row, bundle))

  const predictionBundle = await buildPredictedQueue(bundle, baseQueue)
  const queue = predictionBundle.queue.map((row) => ({ ...row, isAssignedCentre: true }))
  const serving = queue.find((item) => item.queueStatus === 'serving') || null
  const nextInQueue = queue.find((item) => item.queueStatus === 'waiting' && item.checkIn === 'checked-in')
    || queue.find((item) => item.queueStatus === 'waiting')
    || null

  return {
    officer,
    counter,
    centre,
    queue,
    mlDiagnostics: predictionBundle.diagnostics,
    stats: {
      total: queue.length,
      waiting: queue.filter((item) => item.queueStatus === 'waiting').length,
      serving,
      completed: queue.filter((item) => item.queueStatus === 'completed').length,
      skipped: queue.filter((item) => item.queueStatus === 'skipped').length,
      noShow: queue.filter((item) => item.queueStatus === 'no-show').length,
      nextInQueue,
      estimatedWaitMinutes: nextInQueue ? Math.round(Number(nextInQueue.estimatedWaitMinutes || 0)) : 0,
      pendingPayments: queue.filter((item) => item.paymentStatus && item.paymentStatus !== 'completed').length,
      averageProcessingTime: `${Math.round(predictionBundle.profiles.globalAvgServiceMinutes)} min`,
      congestionLevel: predictionBundle.profiles.congestionLevel,
      congestionScore: predictionBundle.profiles.congestionScore,
    },
    notifications: bundle.notifications
      .filter((item) => queue.some((row) => row.userId === item.user_id))
      .map((item) => ({ id: item.id, text: item.message, title: item.title, time: item.created_at, read: !!item.read })),
  }
}

async function directProcess(officerId, bookingId) {
  const { counter, centre } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const nowIso = new Date().toISOString()
  const payload = { queue_status: 'serving', counter_id: counter.id }
  if (await hasColumn('queue_tokens', 'called_at')) payload.called_at = nowIso
  if (await hasColumn('queue_tokens', 'serving_started_at')) payload.serving_started_at = nowIso
  await restUpdate('queue_tokens', { id: `eq.${row.id}` }, payload)
  await ensureNotification(row.userId, 'Token in service', `Please proceed to counter ${counter.counter_number || '1'} at ${centre.name}. Token ${row.token} is now being served.`, 'info')
  const rebuilt = await rebuildQueueForCentreDate(row.centreId, row.date)
  const booking = rebuilt.queue.find((item) => item.id === row.id) || row
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: 'serving', oldStatus: row.queueStatus, newStatus: 'serving', farmersAhead: 0, estimatedWaitMinutes: 0 })
  return { booking, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function getQueueRecord(bookingId) {
  const bundle = await fetchBundle()
  const token = bundle.tokens.find((row) => String(row.id) === String(bookingId))
  if (!token) throw new Error('Booking not found.')
  return { bundle, row: normalizeQueueRow(token, bundle) }
}

async function getActiveBookingsForFarmer(farmerId) {
  const bundle = await fetchBundle()
  const farmerBookings = bundle.tokens.filter((row) => row.farmer_id === farmerId).map((row) => normalizeQueueRow(row, bundle))
  if (!farmerBookings.length) return []
  const activeBookings = farmerBookings.filter((row) => !['completed', 'skipped', 'no-show', 'cancelled'].includes(row.queueStatus))
  if (!activeBookings.length) return []

  const results = []
  for (const chosen of activeBookings) {
    const centreQueue = bundle.tokens
      .filter((row) => row.centre_id === chosen.centreId && row.slot_date === chosen.date)
      .map((row) => normalizeQueueRow(row, bundle))
    const predictionBundle = await buildPredictedQueue(bundle, centreQueue)
    const enriched = predictionBundle.queue.find((row) => row.id === chosen.id) || chosen
    results.push(enriched)
  }
  return results
}

async function getActiveBookingForFarmer(farmerId, preferredBookingId = null) {
  const activeList = await getActiveBookingsForFarmer(farmerId)
  if (!activeList.length) return null
  if (preferredBookingId) {
    const match = activeList.find((b) => b.id === preferredBookingId || b.bookingId === preferredBookingId)
    if (match) return match
  }
  return activeList[0] || null
}

function createBookingId(centreId) {
  return `BK-${localIsoDate().replace(/-/g, '')}-${String(centreId).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
}

async function nextTokenNumber(centreId, slotDate) {
  try {
    const rpcResult = await restRpc('next_queue_token', { p_centre_id: centreId, p_queue_date: slotDate })
    const tokenNumber = Array.isArray(rpcResult) ? rpcResult[0]?.token_number : (typeof rpcResult === 'string' ? rpcResult : rpcResult?.token_number)
    if (tokenNumber) return { tokenNumber, source: 'db-rpc' }
  } catch {
    // fall through to compatibility mode when the RPC migration has not been applied yet
  }

  const sameDay = await restSelect('queue_tokens', { select: 'token_number', centre_id: `eq.${centreId}`, slot_date: `eq.${slotDate}` })
  const next = sameDay
    .map((row) => Number(String(row.token_number || '').replace(/\D/g, '')))
    .filter((value) => !Number.isNaN(value))
    .reduce((max, value) => Math.max(max, value), 0) + 1
  return { tokenNumber: `T-${String(next).padStart(3, '0')}`, source: 'scan-fallback' }
}

async function ensureUniqueToken(bookingId, centreId, slotDate) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { tokenNumber } = await nextTokenNumber(centreId, slotDate)
    await restUpdate('queue_tokens', { id: `eq.${bookingId}` }, { token_number: tokenNumber })
    const same = await restSelect('queue_tokens', { select: 'id', centre_id: `eq.${centreId}`, slot_date: `eq.${slotDate}`, token_number: `eq.${tokenNumber}` })
    if (same.length === 1 && String(same[0].id) === String(bookingId)) return tokenNumber
  }
  throw new Error('Unable to secure a unique token number. Please try booking again.')
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function updateSlotBookedCount(slotId) {
  if (!slotId || !UUID_REGEX.test(String(slotId))) return
  try {
    const slotRows = await restSelect('slots', { select: '*', id: `eq.${slotId}` })
    const slot = slotRows[0]
    if (!slot) return
    const centreMapRows = await restSelect('centres', { select: '*', id: `eq.${slot.centre_id}` })
    const centreCode = centreMapRows[0]?.code
    const procurements = await restSelect('procurements', { select: 'token_id,crop' })
    const procurementByToken = Object.fromEntries(procurements.map((row) => [row.token_id, row]))
    const cropRows = await restSelect('crops', { select: '*', id: `eq.${slot.crop_id}` })
    const cropName = cropRows[0]?.name
    const tokens = await restSelect('queue_tokens', { select: '*', centre_id: `eq.${centreCode}`, slot_date: `eq.${slot.slot_date}`, slot_time: `eq.${slot.slot_time}` })
    const count = tokens.filter((row) => ACTIVE_QUEUE_STATUSES.has(row.queue_status) && String(procurementByToken[row.id]?.crop || '').toLowerCase() === String(cropName || '').toLowerCase()).length
    await restUpdate('slots', { id: `eq.${slotId}` }, { booked_count: count })
  } catch {
    // Ignore error if slots table is not in use or column schema differs
  }
}

async function ensureFarmer(farmerId) {
  // 1. Check if farmer exists by id
  let farmers = await restSelect('farmers', { select: '*', id: `eq.${farmerId}` }).catch(() => [])
  if (farmers[0]) return farmers[0]

  // 2. Check if farmer exists by mobile or user_id
  const digits = String(farmerId).replace(/\D/g, '')
  if (digits) {
    farmers = await restSelect('farmers', { select: '*', mobile: `eq.${digits}` }).catch(() => [])
    if (farmers[0]) return farmers[0]
  }
  farmers = await restSelect('farmers', { select: '*', user_id: `eq.${farmerId}` }).catch(() => [])
  if (farmers[0]) return farmers[0]

  // 3. Find or create a user in users table first
  let user = null
  if (digits) {
    const usersByPhone = await restSelect('users', { select: '*', phone: `eq.${digits}` }).catch(() => [])
    user = usersByPhone[0] || null
  }
  if (!user) {
    const usersById = await restSelect('users', { select: '*', id: `eq.${farmerId}` }).catch(() => [])
    user = usersById[0] || null
  }
  if (!user) {
    const allUsers = await restSelect('users', { select: 'id' }).catch(() => [])
    const nextNum = allUsers
      .map((r) => Number(String(r.id || '').replace(/\D/g, '')))
      .filter((n) => !Number.isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0) + 1
    const newUserId = `usr-f${String(nextNum).padStart(3, '0')}`
    const userEmail = `${digits || 'farmer'}@farmers.queuekisan.in`
    const insertedUser = await restInsert('users', {
      id: newUserId,
      email: userEmail,
      phone: digits || '',
      password_hash: 'password123',
      role: 'FARMER',
    }).catch(async () => {
      return (await restSelect('users', { select: '*', email: `eq.${userEmail}` }).catch(() => []))
    })
    user = Array.isArray(insertedUser) && insertedUser[0] ? insertedUser[0] : { id: newUserId, email: userEmail, phone: digits }
  }

  // 4. Create farmer in farmers table with valid user.id (without non-existent email column)
  const targetId = String(farmerId).startsWith('FRM-') ? farmerId : `FRM-${digits.slice(-4) || String(Date.now()).slice(-4)}`
  const farmerPayload = {
    id: targetId,
    user_id: user.id,
    name: user.email ? user.email.split('@')[0] : 'Farmer',
    mobile: user.phone || digits || '',
    village: 'Ahmednagar',
    taluka: 'Ahmednagar',
    district: 'Ahmednagar',
    registered_date: localIsoDate(),
  }

  let finalFarmer = farmerPayload
  try {
    const inserted = await restInsert('farmers', farmerPayload)
    if (Array.isArray(inserted) && inserted[0]) finalFarmer = inserted[0]
  } catch (err) {
    console.warn('[ensureFarmer] insert fallback:', err.message)
    const existing = (await restSelect('farmers', { select: '*', mobile: `eq.${digits}` }).catch(() => []))[0]
      || (await restSelect('farmers', { select: '*', user_id: `eq.${user.id}` }).catch(() => []))[0]
    if (existing) finalFarmer = existing
  }

  return finalFarmer
}
async function createBooking({ farmerId, centreId, cropId, slotId, slotDate, slotTime, quantityKg }) {
  const farmer = await ensureFarmer(farmerId)
  const resolvedFarmerId = farmer.id

  let centreRows = await restSelect('procurement_centers', { select: '*', id: `eq.${centreId}` }).catch(() => [])
  let centre = centreRows[0]
  if (!centre) {
    centreRows = await restSelect('procurement_centers', { select: '*' }).catch(() => [])
    centre = centreRows.find((c) => c.name.toLowerCase().includes(String(centreId || '').toLowerCase())) || centreRows[0]
  }
  if (!centre) throw new Error('Procurement centre not found.')
  const resolvedCentreId = centre.id

  let slot = null
  if (slotId && UUID_REGEX.test(String(slotId))) {
    try {
      const slotRows = await restSelect('slots', { select: '*', id: `eq.${slotId}` })
      slot = slotRows[0] || null
    } catch {
      slot = null
    }
  }

  // If slot not found in DB or slotId is synthetic string (e.g. slot-m1-2026-09-10), resolve safely
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
      isSynthetic: true,
    }
  }

  if (Number(slot.booked_count || 0) >= Number(slot.capacity || 0)) throw new Error('Selected slot is already full.')

  // Check if this farmer already booked this exact slot/date/centre
  const existingTokens = await restSelect('queue_tokens', {
    select: '*',
    farmer_id: `eq.${resolvedFarmerId}`,
    centre_id: `eq.${resolvedCentreId}`,
    slot_date: `eq.${slot.slot_date}`,
    slot_time: `eq.${slot.slot_time}`,
  })
  const duplicate = existingTokens.find((row) => ACTIVE_QUEUE_STATUSES.has(row.queue_status))
  if (duplicate) throw new Error('You have already booked this specific time slot. Please choose another time slot or centre.')

  let crop = null
  if (/^\d+$/.test(String(cropId || ''))) {
    const cropRows = await restSelect('crops', { select: '*', id: `eq.${cropId}` }).catch(() => [])
    crop = cropRows[0]
  } else {
    const allCrops = await restSelect('crops', { select: '*' }).catch(() => [])
    const cleanCropName = String(cropId || '').replace(/^crop-/i, '').toLowerCase()
    crop = allCrops.find((c) => c.name.toLowerCase().includes(cleanCropName) || cleanCropName.includes(c.name.toLowerCase())) || allCrops[0]
  }

  const bookingId = createBookingId(resolvedCentreId)
  const supportsBookedAt = await hasColumn('queue_tokens', 'booked_at')
  const supportsLastEventAt = await hasColumn('queue_tokens', 'last_event_at')
  const { tokenNumber, source: tokenSource } = await nextTokenNumber(resolvedCentreId, slot.slot_date)
  const queueTokenPayload = {
    id: bookingId,
    token_number: tokenNumber,
    farmer_id: resolvedFarmerId,
    centre_id: resolvedCentreId,
    counter_id: null,
    slot_date: slot.slot_date,
    slot_time: slot.slot_time,
    check_in_status: 'pending',
    verification_status: 'pending',
    queue_status: 'waiting',
    estimated_wait_time: 'Pending calculation',
    position_ahead: 0,
  }
  if (supportsBookedAt) queueTokenPayload.booked_at = new Date().toISOString()
  if (supportsLastEventAt) queueTokenPayload.last_event_at = new Date().toISOString()
  const inserted = await restInsert('queue_tokens', queueTokenPayload)
  const finalTokenNumber = tokenSource === 'db-rpc' ? tokenNumber : await ensureUniqueToken(bookingId, resolvedCentreId, slot.slot_date)
  await restInsert('procurements', {
    id: `PRC-${String(bookingId).replace(/[^A-Za-z0-9]/g, '')}`,
    token_id: bookingId,
    farmer_id: resolvedFarmerId,
    centre_id: resolvedCentreId,
    crop: crop?.name || 'Other Crop',
    variety: 'Standard',
    quantity: Number(quantityKg || 0),
    quality_grade: 'Pending Inspection',
    moisture_content: '',
    amount: 0,
    date: slot.slot_date,
    status: 'pending',
  })
  await updateSlotBookedCount(slot.id)
  await ensureNotification(farmer.user_id, 'Token Generated', `Your token ${finalTokenNumber} is booked for ${centre.name}.`, 'success')
  getFarmerEmail(farmer.id, farmer.user_id).then((email) => {
    if (email) {
      emailService.sendBookingConfirmationEmail({
        to: email,
        farmerName: farmer.name,
        tokenNumber: finalTokenNumber,
        crop: crop?.name,
        centre: centre.name,
        date: slot.slot_date,
        slot: slot.slot_time,
        bookingId: inserted[0].id,
      }).catch((err) => console.error('[createBooking] email error:', err.message))
    }
  }).catch(() => {})
  const rebuilt = await rebuildQueueForCentreDate(resolvedCentreId, slot.slot_date)
  const booking = rebuilt.queue.find((row) => row.id === inserted[0].id)
  await ensureQueueEvent({
    tokenId: inserted[0].id,
    farmerId: resolvedFarmerId,
    centreId: resolvedCentreId,
    eventType: 'booked',
    oldStatus: 'unbooked',
    newStatus: 'waiting',
    farmersAhead: booking?.farmersAhead || 0,
    estimatedWaitMinutes: booking?.estimatedWaitMinutes || 0,
  })
  return {
    booking: booking || normalizeQueueRow(inserted[0], rebuilt.bundle),
    centreId: resolvedCentreId,
    slotDate: slot.slot_date,
    bookingId: inserted[0].id,
    userId: farmer.user_id,
    farmerId: resolvedFarmerId,
  }
}

async function checkInBooking(bookingId) {
  const { row } = await getQueueRecord(bookingId)
  const supportsCheckedInAt = await hasColumn('queue_tokens', 'checked_in_at')
  const payload = { check_in_status: 'checked-in', verification_status: 'completed' }
  if (supportsCheckedInAt) payload.checked_in_at = new Date().toISOString()
  await restUpdate('queue_tokens', { id: `eq.${row.id}` }, payload)
  await ensureNotification(row.userId, 'Check-in confirmed', `Check-in completed for token ${row.token}.`, 'success')
  const rebuilt = await rebuildQueueForCentreDate(row.centreId, row.date)
  const booking = rebuilt.queue.find((item) => item.id === row.id)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, eventType: 'checked-in', oldStatus: row.queueStatus, newStatus: booking.queueStatus, farmersAhead: booking.farmersAhead, estimatedWaitMinutes: booking.estimatedWaitMinutes })
  return { booking, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function updateBookingAction(officerId, bookingId, action) {
  const { counter } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const nowIso = new Date().toISOString()
  const payload = { counter_id: ['rejoin'].includes(action) ? null : counter.id }
  if (action === 'skip') payload.queue_status = 'skipped'
  if (action === 'no-show') payload.queue_status = 'no-show'
  if (action === 'rejoin') payload.queue_status = 'waiting'
  if (action === 'skip' && await hasColumn('queue_tokens', 'skipped_at')) payload.skipped_at = nowIso
  if (action === 'no-show' && await hasColumn('queue_tokens', 'no_show_at')) payload.no_show_at = nowIso
  if (action === 'rejoin' && await hasColumn('queue_tokens', 'rejoined_at')) payload.rejoined_at = nowIso
  await restUpdate('queue_tokens', { id: `eq.${row.id}` }, payload)
  const messages = {
    skip: ['Token skipped', `Your token ${row.token} was marked skipped. Please contact the counter if you need help.`, 'warning'],
    'no-show': ['No-show recorded', `Your token ${row.token} was marked as no-show.`, 'warning'],
    rejoin: ['Queue rejoined', `Your token ${row.token} has been placed back into the waiting queue.`, 'success'],
  }
  const [title, message, type] = messages[action] || []
  if (!title) throw new Error('Unsupported queue action.')
  await ensureNotification(row.userId, title, message, type)
  const rebuilt = await rebuildQueueForCentreDate(row.centreId, row.date)
  const booking = rebuilt.queue.find((item) => item.id === row.id)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: action, oldStatus: row.queueStatus, newStatus: booking.queueStatus, farmersAhead: booking.farmersAhead, estimatedWaitMinutes: booking.estimatedWaitMinutes })
  return { booking, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function callNext(officerId) {
  const { counter, centre } = await getOfficerBundle(officerId)
  const response = await buildQueueResponse(officerId)
  const currentServing = response.queue.find((item) => item.isAssignedCentre && item.queueStatus === 'serving')
  if (currentServing) throw new Error('Complete the current token before calling the next one.')
  const next = response.queue.find((item) => item.isAssignedCentre && item.queueStatus === 'waiting' && item.checkIn === 'checked-in')
    || response.queue.find((item) => item.isAssignedCentre && item.queueStatus === 'waiting')
    || response.queue.find((item) => item.queueStatus === 'waiting' && item.checkIn === 'checked-in')
    || response.queue.find((item) => item.queueStatus === 'waiting')
  if (!next) throw new Error('No waiting farmers available.')

  const payload = { queue_status: 'serving', counter_id: counter.id, position_ahead: 0, estimated_wait_time: 'Now' }
  if (await hasColumn('queue_tokens', 'called_at')) payload.called_at = new Date().toISOString()
  if (await hasColumn('queue_tokens', 'service_started_at')) payload.service_started_at = new Date().toISOString()
  await restUpdate('queue_tokens', { id: `eq.${next.id}` }, payload)
  await ensureNotification(next.userId, 'Token in service', `Please proceed to ${centre.name}. Token ${next.token} is now being served.`, 'info')
  getFarmerEmail(next.farmerId, next.userId).then((email) => {
    if (email) {
      emailService.sendTokenCalledEmail({
        to: email,
        farmerName: next.farmerName,
        tokenNumber: next.token,
        centre: centre.name,
        counter: counter.counter_number ? `Counter ${counter.counter_number}` : 'Weighbridge Counter',
      }).catch((err) => console.error('[callNext] email error:', err.message))
    }
  }).catch(() => {})
  const rebuilt = await rebuildQueueForCentreDate(next.centreId, next.date)
  const booking = rebuilt.queue.find((item) => item.id === next.id)
  await ensureQueueEvent({ tokenId: next.id, farmerId: next.farmerId, centreId: next.centreId, counterId: counter.id, eventType: 'called', oldStatus: next.queueStatus, newStatus: booking.queueStatus, farmersAhead: booking.farmersAhead, estimatedWaitMinutes: booking.estimatedWaitMinutes })
  return { booking, centreId: next.centreId, slotDate: next.date, bookingId: next.id, userId: next.userId, farmerId: next.farmerId }
}

async function ensureProcurement(row) {
  const found = await restSelect('procurements', { select: '*', token_id: `eq.${row.id}` })
  if (found[0]) return found[0]
  const created = await restInsert('procurements', {
    id: `PRC-${String(row.id).replace(/[^A-Za-z0-9]/g, '')}`,
    token_id: row.id,
    farmer_id: row.farmerId,
    centre_id: row.centreId,
    crop: row.crop === 'Not recorded' ? 'Wheat' : row.crop,
    variety: 'Standard',
    quantity: Number(row.quantityKg || 0),
    quality_grade: row.quality || 'Grade A',
    moisture_content: row.moisture || '',
    amount: Number(row.amount || 0),
    date: row.date,
    status: 'pending',
  })
  return created[0]
}

async function ensurePayment(procurement, row, payload = {}) {
  const found = await restSelect('payments', { select: '*', procurement_id: `eq.${procurement.id}` })
  const nextStatus = payload.status || found[0]?.status || 'pending'
  const paymentPayload = {
    id: found[0]?.id || `PAY-${String(procurement.id).replace(/[^A-Za-z0-9]/g, '')}`,
    reference_id: payload.referenceId || found[0]?.reference_id || `PAY-${row.token}`,
    procurement_id: procurement.id,
    farmer_id: row.farmerId,
    amount: Number(payload.amount ?? procurement.amount ?? row.amount ?? 0),
    payment_date: payload.paymentDate ? localIsoDate(payload.paymentDate) : (found[0]?.payment_date || localIsoDate()),
    payment_method: payload.method || found[0]?.payment_method || 'Bank Transfer',
    status: nextStatus,
  }
  if (found[0]) {
    const updated = await restUpdate('payments', { id: `eq.${found[0].id}` }, paymentPayload)
    return updated[0]
  }
  const inserted = await restInsert('payments', paymentPayload)
  return inserted[0]
}

async function verifyFarmer(officerId, bookingId) {
  const { counter } = await getOfficerBundle(officerId)
  const result = await checkInBooking(bookingId)
  await ensureQueueEvent({ tokenId: result.bookingId, farmerId: result.farmerId, centreId: result.centreId, counterId: counter.id, eventType: 'verified', oldStatus: 'waiting', newStatus: result.booking.queueStatus, farmersAhead: result.booking.farmersAhead, estimatedWaitMinutes: result.booking.estimatedWaitMinutes })
  return result
}

async function submitProduce(officerId, bookingId, payload) {
  const { counter } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const procurement = await ensureProcurement(row)
  await restUpdate('procurements', { id: `eq.${procurement.id}` }, {
    crop: payload.crop || (row.crop === 'Not recorded' ? 'Wheat' : row.crop),
    quantity: Number(payload.quantity || row.quantityKg || 0),
    quality_grade: payload.quality || row.quality || 'Grade A',
    moisture_content: payload.moisture || '',
    variety: payload.remarks || procurement.variety || 'Standard',
    status: procurement.status === 'completed' ? 'completed' : 'pending',
    amount: Number(procurement.amount || 0),
  })
  await ensureNotification(row.userId, 'Produce details updated', `Produce details for token ${row.token} were recorded successfully.`, 'success')
  const refreshed = await getQueueRecord(bookingId)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: 'produce-entered', oldStatus: row.queueStatus, newStatus: refreshed.row.queueStatus, farmersAhead: refreshed.row.farmersAhead, metadata: payload })
  return { booking: refreshed.row, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function startProcurement(officerId, bookingId) {
  const { counter } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const procurement = await ensureProcurement(row)
  const queuePayload = { queue_status: 'serving', counter_id: counter.id }
  if (await hasColumn('queue_tokens', 'service_started_at')) queuePayload.service_started_at = new Date().toISOString()
  await restUpdate('queue_tokens', { id: `eq.${row.id}` }, queuePayload)
  await restUpdate('procurements', { id: `eq.${procurement.id}` }, { status: 'in-progress' })
  await ensureNotification(row.userId, 'Procurement started', `Procurement has started for token ${row.token}.`, 'info')
  const rebuilt = await rebuildQueueForCentreDate(row.centreId, row.date)
  const booking = rebuilt.queue.find((item) => item.id === row.id)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: 'procurement-started', oldStatus: row.queueStatus, newStatus: booking.queueStatus, farmersAhead: booking.farmersAhead, estimatedWaitMinutes: booking.estimatedWaitMinutes })
  return { booking, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function confirmAmount(officerId, bookingId, payload) {
  const { counter } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const procurement = await ensureProcurement(row)
  const finalQuantity = Number(payload.quantity !== undefined ? payload.quantity : (procurement.quantity || row.quantityKg || 0))
  const finalAmount = Number(payload.amount !== undefined ? payload.amount : (procurement.amount || 0))
  await restUpdate('procurements', { id: `eq.${procurement.id}` }, {
    quantity: finalQuantity,
    amount: finalAmount,
    quality_grade: payload.quality || procurement.quality_grade || 'Grade A',
    status: 'in-progress',
  })
  await ensureNotification(row.userId, 'Amount confirmed', `The estimated procurement amount of ₹${finalAmount.toLocaleString('en-IN')} for token ${row.token} has been confirmed.`, 'info')
  const refreshed = await getQueueRecord(bookingId)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: 'amount-confirmed', oldStatus: row.queueStatus, newStatus: refreshed.row.queueStatus, farmersAhead: refreshed.row.farmersAhead, metadata: { amount: finalAmount, quantity: finalQuantity } })
  return { booking: refreshed.row, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function completeProcurement(officerId, bookingId, payload) {
  const { counter } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const procurement = await ensureProcurement(row)
  const finalAmount = Number(payload.amount !== undefined ? payload.amount : (procurement.amount || 0))
  const finalQuantity = Number(payload.quantity !== undefined ? payload.quantity : (procurement.quantity || row.quantityKg || 0))
  await restUpdate('procurements', { id: `eq.${procurement.id}` }, {
    quantity: finalQuantity,
    amount: finalAmount,
    quality_grade: payload.quality || procurement.quality_grade || 'Grade A',
    status: 'completed',
    date: localIsoDate(),
  })
  const queuePayload = { queue_status: 'completed', counter_id: counter.id, position_ahead: 0, estimated_wait_time: 'Done' }
  if (await hasColumn('queue_tokens', 'service_completed_at')) queuePayload.service_completed_at = new Date().toISOString()
  await restUpdate('queue_tokens', { id: `eq.${row.id}` }, queuePayload)
  const payment = await ensurePayment({ ...procurement, quantity: finalQuantity, amount: finalAmount }, row, { status: 'processing', amount: finalAmount })
  await ensureNotification(row.userId, 'Procurement completed', `Procurement of ${finalQuantity} kg has been completed for token ${row.token}. Payment reference ${payment.reference_id} is now processing.`, 'success')
  getFarmerEmail(row.farmerId, row.userId).then((email) => {
    if (email) {
      emailService.sendProcurementCompletedEmail({
        to: email,
        farmerName: row.farmerName,
        tokenNumber: row.token,
        crop: row.crop,
        quantity: `${finalQuantity} kg`,
        amount: finalAmount,
        centre: row.centreName,
        procurementId: procurement.id,
      }).catch((err) => console.error('[completeProcurement] email error:', err.message))
    }
  }).catch(() => {})
  const rebuilt = await rebuildQueueForCentreDate(row.centreId, row.date)
  const booking = rebuilt.queue.find((item) => item.id === row.id)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: 'procurement-completed', oldStatus: row.queueStatus, newStatus: booking.queueStatus, farmersAhead: booking.farmersAhead, metadata: { amount: finalAmount, quantity: finalQuantity } })
  return { booking, payment, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function updatePayment(officerId, bookingId, payload) {
  const { counter } = await getOfficerBundle(officerId)
  const { row } = await getQueueRecord(bookingId)
  const procurement = await ensureProcurement(row)
  const payment = await ensurePayment(procurement, row, payload)
  try {
    await restInsert('payment_status_history', {
      payment_id: payment.id,
      status: payload.status || payment.status,
      remarks: `Updated by counter ${counter.counter_number}: ${titleCase(payload.status || payment.status)}`,
    })
  } catch {
    // keep payment update successful even if audit insert fails
  }
  if ((payload.status || payment.status) === 'completed') {
    await ensureNotification(row.userId, 'Payment transferred', `Payment of ₹${Number(payload.amount ?? payment.amount ?? 0).toLocaleString('en-IN')} has been marked completed. Reference ID: ${payload.referenceId || payment.reference_id}.`, 'success')
    getFarmerEmail(row.farmerId, row.userId).then((email) => {
      if (email) {
        emailService.sendPaymentUpdateEmail({
          to: email,
          farmerName: row.farmerName,
          amount: Number(payload.amount ?? payment.amount ?? 0),
          referenceId: payload.referenceId || payment.reference_id,
          status: 'Completed',
          centre: row.centreName,
        }).catch((err) => console.error('[updatePayment] email error:', err.message))
      }
    }).catch(() => {})
  } else {
    await ensureNotification(row.userId, 'Payment update', `Payment status for token ${row.token} is now ${payload.status || payment.status}.`, 'info')
  }
  const refreshed = await getQueueRecord(bookingId)
  await ensureQueueEvent({ tokenId: row.id, farmerId: row.farmerId, centreId: row.centreId, counterId: counter.id, eventType: 'payment-updated', oldStatus: row.paymentStatus, newStatus: payment.status, metadata: { paymentId: payment.id, referenceId: payment.reference_id } })
  return { booking: refreshed.row, payment, centreId: row.centreId, slotDate: row.date, bookingId: row.id, userId: row.userId, farmerId: row.farmerId }
}

async function getQueuePosition(bookingId) {
  const { bundle, row } = await getQueueRecord(bookingId)
  const centreQueue = bundle.tokens.filter((item) => item.centre_id === row.centreId && item.slot_date === row.date).map((item) => normalizeQueueRow(item, bundle))
  const predictionBundle = await buildPredictedQueue(bundle, centreQueue)
  const current = predictionBundle.queue.find((item) => item.id === row.id)
  const serving = predictionBundle.queue.find((item) => item.queueStatus === 'serving')
  return {
    bookingId: row.id,
    token: row.token,
    centreId: row.centreId,
    centreName: row.centreName,
    farmersAhead: current?.farmersAhead || 0,
    servingToken: serving?.token || '—',
    estimatedWaitMinutes: Math.round(Number(current?.estimatedWaitMinutes || 0)),
    predictedServiceMinutes: Number(current?.predictedServiceMinutes || 0),
    congestionLevel: predictionBundle.profiles.congestionLevel,
    averageProcessingTime: Math.round(predictionBundle.profiles.globalAvgServiceMinutes),
    timeline: predictionBundle.queue.map((item) => item.token),
    predictionSource: current?.predictionSource || predictionBundle.diagnostics?.model || 'historical-heuristic',
    predictionModel: predictionBundle.diagnostics?.model || 'historical-heuristic',
    loadCluster: current?.loadCluster || null,
    mlDiagnostics: predictionBundle.diagnostics,
  }
}

async function getAnalytics() {
  const bundle = await fetchBundle()
  const today = localIsoDate()
  const queue = bundle.tokens
    .filter((row) => shouldShowAtCounter(row, today))
    .map((row) => normalizeQueueRow(row, bundle))
  const predictionBundle = await buildPredictedQueue(bundle, queue)
  return buildAnalyticsBundle({
    farmers: bundle.farmers,
    procurements: bundle.procurements,
    tokens: bundle.tokens,
    centres: bundle.centres,
    queue: predictionBundle.queue,
    crops: bundle.crops,
    queueEvents: bundle.queueEvents,
    mlDiagnostics: predictionBundle.diagnostics,
  })
}

async function getMlDiagnostics() {
  const bundle = await fetchBundle()
  const today = localIsoDate()
  const queue = bundle.tokens
    .filter((row) => shouldShowAtCounter(row, today))
    .map((row) => normalizeQueueRow(row, bundle))
  const predictionBundle = await buildPredictedQueue(bundle, queue)
  return predictionBundle.diagnostics
}

export {
  buildQueueResponse,
  createBooking,
  checkInBooking,
  getActiveBookingForFarmer,
  getActiveBookingsForFarmer,
  getQueuePosition,
  updateBookingAction,
  callNext,
  directProcess,
  verifyFarmer,
  submitProduce,
  startProcurement,
  confirmAmount,
  completeProcurement,
  updatePayment,
  getAnalytics,
  getMlDiagnostics,
}
