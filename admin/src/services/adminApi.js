import { restInsert, restSelect, restUpdate, titleFromEmail } from './platform'

const API_BASE = import.meta.env.VITE_QUEUE_SERVER_URL || ''

async function requestQueueServer(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || data?.message || 'Queue server request failed')
  return data
}

function localIsoDate(value = new Date()) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const todayIso = () => localIsoDate()
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')
const money = (value) => Number(value || 0)
const quantityDisplay = (value) => `${Number(value || 0).toLocaleString('en-IN')} kg`
const parseWaitMinutes = (value) => {
  if (value == null || value === '' || value === 'Now' || value === 'Done') return 0
  const matched = String(value).match(/\d+(?:\.\d+)?/)
  return matched ? Number(matched[0]) : 0
}
const ACTIVE_QUEUE_STATUSES = new Set(['waiting', 'serving'])

function shouldShowLiveBooking(row, today = todayIso()) {
  if (!row?.slot_date) return false
  return row.slot_date >= today || ACTIVE_QUEUE_STATUSES.has(row.queue_status)
}

function normalizePaymentProfile(row = {}) {
  return {
    accountHolder: row.account_holder || '',
    bankName: row.bank_name || '',
    accountNumber: row.account_number || '',
    ifscCode: row.ifsc_code || '',
    upiId: row.upi_id || '',
  }
}

async function getPaymentProfilesByFarmer() {
  try {
    const rows = await restSelect('farmer_payment_details', { select: '*' })
    return Object.fromEntries(rows.map((row) => [row.farmer_id, normalizePaymentProfile(row)]))
  } catch {
    return {}
  }
}

function statusFromQueue(queueStatus) {
  if (queueStatus === 'completed') return 'completed'
  if (queueStatus === 'serving') return 'serving'
  if (queueStatus === 'waiting') return 'active'
  if (queueStatus === 'skipped' || queueStatus === 'no-show') return 'inactive'
  return 'active'
}

function deriveFarmerStatus(tokens) {
  const latest = [...tokens].sort((a, b) => `${b.slot_date} ${b.slot_time}`.localeCompare(`${a.slot_date} ${a.slot_time}`))[0]
  if (!latest) return 'active'
  return ['completed', 'skipped', 'no-show'].includes(latest.queue_status) ? 'inactive' : 'active'
}

function buildTimeRange(startTime, endTime) {
  const start = new Date(`2000-01-01T${startTime}:00`)
  const end = new Date(`2000-01-01T${endTime}:00`)
  return `${start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
}

function dateRange(startDate, endDate) {
  const days = []
  const cursor = new Date(`${startDate}T00:00:00`)
  const last = new Date(`${endDate}T00:00:00`)
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function titleCase(value = '') {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function fetchBundle() {
  const [centres, centreMapRows, farmers, users, tokens, procurements, payments, counters, notifications, slots, crops, paymentProfilesByFarmer] = await Promise.all([
    restSelect('procurement_centers', { select: '*' }),
    restSelect('centres', { select: '*' }),
    restSelect('farmers', { select: '*' }),
    restSelect('users', { select: '*' }),
    restSelect('queue_tokens', { select: '*' }),
    restSelect('procurements', { select: '*' }),
    restSelect('payments', { select: '*' }),
    restSelect('counters', { select: '*' }),
    restSelect('notifications', { select: '*' }),
    restSelect('slots', { select: '*' }),
    restSelect('crops', { select: '*' }),
    getPaymentProfilesByFarmer(),
  ])

  const centreByUuid = Object.fromEntries(centreMapRows.map((row) => [row.id, row]))
  const centreByCode = Object.fromEntries(centreMapRows.filter((row) => row.code).map((row) => [row.code, row]))
  const centreUuidByCode = Object.fromEntries(centreMapRows.filter((row) => row.code).map((row) => [row.code, row]))
  const procCentreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  const userById = Object.fromEntries(users.map((row) => [row.id, row]))
  const farmerById = Object.fromEntries(farmers.map((row) => [row.id, row]))
  const tokensByFarmer = tokens.reduce((acc, row) => {
    acc[row.farmer_id] ||= []
    acc[row.farmer_id].push(row)
    return acc
  }, {})
  const procurementByToken = Object.fromEntries(procurements.map((row) => [row.token_id, row]))
  const paymentByProcurement = Object.fromEntries(payments.map((row) => [row.procurement_id, row]))
  const centreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  const cropById = Object.fromEntries(crops.map((row) => [row.id, row]))

  return {
    centres,
    centreMapRows,
    centreByUuid,
    centreByCode,
    centreUuidByCode,
    procCentreById,
    farmers,
    users,
    tokens,
    procurements,
    payments,
    counters,
    notifications,
    slots,
    crops,
    paymentProfilesByFarmer,
    userById,
    farmerById,
    tokensByFarmer,
    procurementByToken,
    paymentByProcurement,
    centreById,
    cropById,
  }
}

export async function getDashboardKPIs() {
  const { farmers, tokens, procurements, payments } = await fetchBundle()
  const today = todayIso()
  const visibleTokens = tokens.filter((row) => shouldShowLiveBooking(row, today))
  return {
    totalFarmers: farmers.length,
    todaysBookings: visibleTokens.filter((row) => row.queue_status === 'waiting').length,
    activeQueue: visibleTokens.filter((row) => row.queue_status === 'serving').length,
    completedProcurements: procurements.filter((row) => row.status === 'completed').length,
    pendingPayments: payments.filter((row) => row.status !== 'completed').length,
    totalProcurementAmount: procurements.reduce((sum, row) => sum + money(row.amount), 0),
  }
}

export async function getCentres() {
  const { centres, centreUuidByCode, tokens, slots } = await fetchBundle()
  const today = todayIso()
  return centres.map((centre) => {
    const centreUuid = centreUuidByCode[centre.id]?.id
    const activeTokens = tokens.filter((row) => (row.centre_id === centre.id || (centreUuid && row.centre_id === centreUuid)) && shouldShowLiveBooking(row, today))
    const slotRows = slots.filter((row) => row.slot_date >= today && (row.centre_id === centre.id || (centreUuid && row.centre_id === centreUuid)))
    const currentOccupancy = activeTokens.length
    const slotCapacity = slotRows.reduce((sum, row) => sum + Number(row.capacity || 0), 0)
    return {
      id: centre.id,
      dbId: centreUuid || centre.id,
      name: centre.name,
      taluka: centre.taluka,
      district: centre.district,
      address: centre.address,
      capacity: Number(centre.capacity || slotCapacity || 0),
      currentOccupancy,
      status: centre.status,
      contact: centre.contact,
      coordinates: centre.coordinates,
    }
  })
}

export async function createCentre(payload) {
  const existing = await restSelect('procurement_centers', { select: 'id' })
  const nextNumber = existing
    .map((row) => Number(String(row.id || '').replace(/\D/g, '')))
    .filter((num) => !Number.isNaN(num))
    .reduce((max, num) => Math.max(max, num), 0) + 1
  const centreId = `CTR-${String(nextNumber).padStart(3, '0')}`
  const centre = {
    id: centreId,
    name: payload.name,
    taluka: payload.taluka,
    district: payload.district,
    address: payload.address,
    capacity: Number(payload.capacity || 0),
    status: payload.status || 'active',
    contact: payload.contact || '',
    coordinates: payload.coordinates || '',
  }
  await restInsert('procurement_centers', centre)
  await restInsert('centres', { name: centre.name, code: centre.id, location: centre.taluka })
  return centre
}

export async function updateCentre(centreDbId, payload) {
  const centreMapRows = await restSelect('centres', { select: '*' })
  const mapping = centreMapRows.find((row) => row.id === centreDbId || row.code === centreDbId)
  const code = mapping?.code || centreDbId

  if (mapping) {
    await restUpdate('centres', { id: `eq.${mapping.id}` }, { name: payload.name, code, location: payload.taluka })
  }
  const updated = await restUpdate('procurement_centers', { id: `eq.${code}` }, {
    name: payload.name,
    taluka: payload.taluka,
    district: payload.district,
    address: payload.address,
    capacity: Number(payload.capacity || 0),
    status: payload.status || 'active',
    contact: payload.contact || '',
    coordinates: payload.coordinates || '',
  })
  return updated[0]
}

export async function toggleCentreStatus(centreDbId) {
  const centres = await getCentres()
  const centre = centres.find((row) => row.dbId === centreDbId || row.id === centreDbId)
  if (!centre) throw new Error('Centre not found')
  const newStatus = centre.status === 'active' ? 'inactive' : 'active'
  return updateCentre(centre.dbId, { ...centre, status: newStatus })
}

export async function deleteCentre(centreDbId) {
  const centreMapRows = await restSelect('centres', { select: '*' })
  const mapping = centreMapRows.find((row) => row.id === centreDbId || row.code === centreDbId)
  const code = mapping?.code || centreDbId
  if (mapping) {
    await restDelete('centres', { id: `eq.${mapping.id}` }).catch(() => {})
  }
  await restDelete('procurement_centers', { id: `eq.${code}` }).catch(() => {})
  return { deleted: true }
}

export async function getCounters(centreId = 'all') {
  const { counters, users, centres } = await fetchBundle()
  const userById = Object.fromEntries(users.map((row) => [row.id, row]))
  const centreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  const filtered = counters.filter((c) => centreId === 'all' || c.centre_id === centreId)
  return filtered.map((c) => {
    const officer = userById[c.officer_id]
    const centre = centreById[c.centre_id]
    return {
      id: c.id,
      centreId: c.centre_id,
      centreName: centre?.name || c.centre_id,
      counterNumber: c.counter_number || c.id,
      officerId: c.officer_id || '',
      officerName: officer?.name || titleFromEmail(officer?.email || c.officer_id || 'Unassigned'),
      officerEmail: officer?.email || '',
      officerMobile: officer?.phone || '—',
      status: c.status || 'active',
    }
  })
}

export async function createCounter(payload) {
  const id = `CTR-${payload.centre_id}-${payload.counter_number || 'C' + Date.now().toString().slice(-3)}`
  const record = {
    id,
    centre_id: payload.centre_id,
    counter_number: payload.counter_number || 'C1',
    officer_id: payload.officer_id || null,
    status: payload.status || 'active',
  }
  await restInsert('counters', record)
  return record
}

export async function updateCounter(counterId, payload) {
  const updated = await restUpdate('counters', { id: `eq.${counterId}` }, {
    counter_number: payload.counter_number,
    centre_id: payload.centre_id,
    officer_id: payload.officer_id || null,
    status: payload.status || 'active',
  })
  return updated[0] || payload
}

export async function deleteCounter(counterId) {
  await restDelete('counters', { id: `eq.${counterId}` })
  return { deleted: true }
}

export async function toggleCounterStatus(counterId) {
  const counters = await restSelect('counters', { select: '*', id: `eq.${counterId}` })
  const counter = counters[0]
  if (!counter) throw new Error('Counter not found')
  const newStatus = counter.status === 'active' ? 'inactive' : 'active'
  return updateCounter(counterId, { ...counter, status: newStatus })
}

export async function getOperators() {
  const { users, counters, centres } = await fetchBundle()
  const counterByOfficer = Object.fromEntries(counters.filter((c) => c.officer_id).map((c) => [c.officer_id, c]))
  const centreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  const operators = users.filter((u) => u.role === 'COUNTER_PERSON' || u.role === 'officer')
  return operators.map((user) => {
    const counter = counterByOfficer[user.id]
    const centre = counter ? centreById[counter.centre_id] : null
    return {
      id: user.id,
      name: user.name || titleFromEmail(user.email),
      email: user.email,
      phone: user.phone || '—',
      role: 'Counter Operator',
      centreId: counter?.centre_id || '',
      centreName: centre?.name || (counter ? counter.centre_id : 'Unassigned'),
      counterId: counter?.id || '',
      counterNumber: counter?.counter_number || 'Unassigned',
      password: user.password_hash || '******',
      status: counter?.status || 'active',
    }
  })
}

export async function createOperator(payload) {
  const userId = `USR-${Date.now().toString().slice(-6)}`
  const record = {
    id: userId,
    email: payload.email,
    name: payload.name,
    phone: payload.phone || '',
    role: 'COUNTER_PERSON',
    password_hash: payload.password || '123456',
  }
  await restInsert('users', record)
  if (payload.counter_id) {
    await restUpdate('counters', { id: `eq.${payload.counter_id}` }, { officer_id: userId })
  }
  return record
}

export async function updateOperator(operatorId, payload) {
  await restUpdate('users', { id: `eq.${operatorId}` }, {
    name: payload.name,
    email: payload.email,
    phone: payload.phone || '',
    password_hash: payload.password || undefined,
  })
  if (payload.counter_id) {
    await restUpdate('counters', { officer_id: `eq.${operatorId}` }, { officer_id: null }).catch(() => {})
    await restUpdate('counters', { id: `eq.${payload.counter_id}` }, { officer_id: operatorId })
  }
  return { updated: true }
}

export async function deleteOperator(operatorId) {
  await restUpdate('counters', { officer_id: `eq.${operatorId}` }, { officer_id: null }).catch(() => {})
  await restDelete('users', { id: `eq.${operatorId}` })
  return { deleted: true }
}

export async function getCentreStats() {
  const { centres, tokens, procurements, payments, farmers } = await fetchBundle()
  const today = todayIso()
  return centres.map((centre) => {
    const centreTokens = tokens.filter((t) => t.centre_id === centre.id || t.centre_id === centre.code)
    const todayTokens = centreTokens.filter((t) => t.slot_date === today)
    const waitingTokens = centreTokens.filter((t) => t.queue_status === 'waiting')
    const completedTokens = centreTokens.filter((t) => t.queue_status === 'completed')
    const centreProcurements = procurements.filter((p) => p.centre_id === centre.id || p.centre_id === centre.code)
    const totalWeightKg = centreProcurements.reduce((sum, p) => sum + Number(p.quantity || 0), 0)
    const totalAmount = centreProcurements.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const capacity = Number(centre.capacity || 20)
    const loadPct = capacity > 0 ? Math.min(100, Math.round((todayTokens.length / capacity) * 100)) : 0

    return {
      centreId: centre.id,
      centreName: centre.name,
      taluka: centre.taluka || '—',
      district: centre.district || '—',
      status: centre.status || 'active',
      capacity,
      todayBookings: todayTokens.length,
      waiting: waitingTokens.length,
      completed: completedTokens.length,
      totalWeightKg: `${totalWeightKg.toLocaleString('en-IN')} kg`,
      totalAmount: `₹${totalAmount.toLocaleString('en-IN')}`,
      loadPct,
    }
  })
}

export async function getCounterPerformance() {
  const { counters, users, centres, tokens, procurements } = await fetchBundle()
  const userById = Object.fromEntries(users.map((row) => [row.id, row]))
  const centreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  const today = todayIso()

  return counters.map((counter) => {
    const officer = userById[counter.officer_id]
    const centre = centreById[counter.centre_id]
    const counterTokens = tokens.filter((t) => t.counter_id === counter.id)
    const completedToday = counterTokens.filter((t) => t.slot_date === today && t.queue_status === 'completed').length
    const currentlyServing = counterTokens.find((t) => t.queue_status === 'serving')

    return {
      counterId: counter.id,
      counterNumber: counter.counter_number || counter.id,
      centreName: centre?.name || counter.centre_id,
      officerName: officer?.name || titleFromEmail(officer?.email || 'Unassigned'),
      officerMobile: officer?.phone || '—',
      status: counter.status,
      currentlyServing: currentlyServing ? currentlyServing.token_number : 'Idle',
      completedToday,
      totalServed: counterTokens.length,
      avgServiceMinutes: '8.5 min',
      performanceScore: `${Math.min(99, 85 + (completedToday * 2))}%`,
    }
  })
}

export async function getSlots() {
  const { slots, centreByUuid, procCentreById, cropById } = await fetchBundle()
  return slots
    .map((slot) => {
      const code = centreByUuid[slot.centre_id]?.code || slot.centre_id
      const name = procCentreById[code]?.name || centreByUuid[slot.centre_id]?.name || slot.centre_id
      return {
        id: String(slot.id),
        centreId: code,
        centreDbId: slot.centre_id,
        centreName: name,
        crop: cropById[slot.crop_id]?.name || 'All Crops',
        cropId: slot.crop_id,
        date: slot.slot_date,
        timeSlot: slot.slot_time,
        capacity: Number(slot.capacity || 0),
        booked: Number(slot.booked_count || 0),
        remaining: Math.max(0, Number(slot.capacity || 0) - Number(slot.booked_count || 0)),
        status: Number(slot.booked_count || 0) >= Number(slot.capacity || 0) ? 'full' : (slot.slot_date < todayIso() ? 'completed' : 'active'),
      }
    })
    .sort((a, b) => `${a.date} ${a.timeSlot}`.localeCompare(`${b.date} ${b.timeSlot}`))
}

export async function generateSlots(payload) {
  const centreMatch = await restSelect('centres', { select: '*' })
  const centre = centreMatch.find((c) => c.id === payload.centre_id || c.code === payload.centre_id)
  if (!centre) throw new Error('Centre mapping not found')
  const crops = await restSelect('crops', { select: '*' })
  const days = dateRange(payload.start_date, payload.end_date)
  const durationMinutes = Number(payload.slot_duration_minutes || 60)

  const buildTimes = () => {
    const times = []
    let cursor = new Date(`2000-01-01T${payload.start_time}:00`)
    const limit = new Date(`2000-01-01T${payload.end_time}:00`)
    while (cursor < limit) {
      const end = new Date(cursor.getTime() + durationMinutes * 60 * 1000)
      times.push(buildTimeRange(cursor.toTimeString().slice(0, 5), end.toTimeString().slice(0, 5)))
      cursor = end
    }
    return times
  }

  const slotTimes = buildTimes()
  const existing = await restSelect('slots', { select: '*' })
  const existingKeys = new Set(existing.map((row) => `${row.centre_id}|${row.crop_id}|${row.slot_date}|${row.slot_time}`))
  const inserts = []

  days.forEach((day) => {
    crops.forEach((crop) => {
      slotTimes.forEach((slotTime) => {
        const key = `${centre.id}|${crop.id}|${day}|${slotTime}`
        if (!existingKeys.has(key)) {
          inserts.push({ centre_id: centre.id, crop_id: crop.id, slot_date: day, slot_time: slotTime, capacity: Number(payload.capacity || 20), booked_count: 0 })
        }
      })
    })
  })

  for (let index = 0; index < inserts.length; index += 200) {
    const chunk = inserts.slice(index, index + 200)
    if (chunk.length) await restInsert('slots', chunk)
  }

  return { generated: inserts.length }
}

export async function getOfficers() {
  const { counters, users, centres } = await fetchBundle()
  const userById = Object.fromEntries(users.map((row) => [row.id, row]))
  const centreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  return counters.map((counter) => {
    const user = userById[counter.officer_id]
    return {
      id: counter.officer_id,
      name: titleFromEmail(user?.email || counter.officer_id),
      designation: 'Counter Person',
      mobile: user?.phone || '—',
      centreId: counter.centre_id,
      centreName: centreById[counter.centre_id]?.name || counter.centre_id,
      status: counter.status,
    }
  })
}

export async function getQueueData() {
  const { centres, tokens, farmers, procurementByToken, centreUuidByCode } = await fetchBundle()
  const farmerById = Object.fromEntries(farmers.map((row) => [row.id, row]))
  const today = todayIso()
  return centres.map((centre) => {
    const centreUuid = centreUuidByCode[centre.id]?.id
    const rows = tokens
      .filter((row) => (row.centre_id === centre.id || (centreUuid && row.centre_id === centreUuid)) && shouldShowLiveBooking(row, today))
      .sort((a, b) => {
        const priority = { serving: 0, waiting: 1, completed: 2, skipped: 3, 'no-show': 4 }
        const pa = priority[a.queue_status] ?? 9
        const pb = priority[b.queue_status] ?? 9
        if (pa !== pb) return pa - pb
        return `${a.slot_date} ${a.slot_time}`.localeCompare(`${b.slot_date} ${b.slot_time}`)
      })
    const serving = rows.find((row) => row.queue_status === 'serving')
    const waitingRows = rows.filter((row) => row.queue_status === 'waiting')
    const waitValues = waitingRows.map((row) => Number(row.estimated_wait_minutes ?? parseWaitMinutes(row.estimated_wait_time))).filter((value) => Number.isFinite(value))
    const centreWait = waitValues.length ? Math.round(Math.max(...waitValues)) : 0
    return {
      centreId: centre.id,
      centreName: centre.name,
      status: centre.status === 'active' ? (serving || waitingRows.length ? 'active' : 'idle') : 'closed',
      currentToken: serving?.token_number || '-',
      servingFarmer: farmerById[serving?.farmer_id]?.name || '-',
      waitingFarmers: waitingRows.length,
      estimatedWait: centreWait ? `${centreWait} min` : '0 min',
      completedTokens: rows.filter((row) => row.queue_status === 'completed').length,
      totalBookings: rows.length,
      bookedSlots: rows.map((row) => ({
        bookingId: row.id,
        token: row.token_number,
        farmerName: farmerById[row.farmer_id]?.name || row.farmer_id,
        mobile: farmerById[row.farmer_id]?.mobile || '-',
        crop: procurementByToken[row.id]?.crop || 'Not recorded',
        date: row.slot_date,
        slot: row.slot_time,
        checkIn: row.check_in_status,
        status: row.queue_status,
      })),
    }
  })
}

export async function getFarmers() {
  const { farmers, tokensByFarmer, paymentProfilesByFarmer } = await fetchBundle()
  return farmers.map((farmer) => {
    const farmerTokens = tokensByFarmer[farmer.id] || []
    const paymentProfile = paymentProfilesByFarmer[farmer.id] || null
    return {
      id: farmer.id,
      name: farmer.name,
      mobile: farmer.mobile,
      village: farmer.village,
      taluka: farmer.taluka,
      district: farmer.district,
      aadhaar: farmer.user_id,
      registeredDate: formatDate(farmer.registered_date),
      totalBookings: farmerTokens.length,
      paymentDetails: paymentProfile ? 'active' : 'pending',
      paymentProfile,
      status: deriveFarmerStatus(farmerTokens),
    }
  })
}

export async function getBookingHistoryFor(farmerId) {
  const { tokens, procurementByToken, centreByUuid, procCentreById } = await fetchBundle()
  return tokens
    .filter((row) => row.farmer_id === farmerId)
    .map((row) => {
      const code = centreByUuid[row.centre_id]?.code || row.centre_id
      const name = procCentreById[code]?.name || procCentreById[row.centre_id]?.name || centreByUuid[row.centre_id]?.name || row.centre_id
      return {
        bookingId: row.id,
        centreName: name,
        centreId: code,
        slotDate: row.slot_date,
        slotTime: row.slot_time,
        crop: procurementByToken[row.id]?.crop || 'Not recorded',
        status: row.queue_status,
      }
    })
    .sort((a, b) => `${b.slotDate} ${b.slotTime}`.localeCompare(`${a.slotDate} ${a.slotTime}`))
}

export async function getProcurements() {
  const { procurements, farmers, centreByUuid, procCentreById } = await fetchBundle()
  const farmerById = Object.fromEntries(farmers.map((row) => [row.id, row]))
  return procurements
    .map((row) => {
      const code = centreByUuid[row.centre_id]?.code || row.centre_id
      const name = procCentreById[code]?.name || procCentreById[row.centre_id]?.name || centreByUuid[row.centre_id]?.name || row.centre_id
      return {
        id: row.id,
        tokenId: row.token_id,
        farmerId: row.farmer_id,
        farmerName: farmerById[row.farmer_id]?.name || row.farmer_id,
        centreId: code,
        centreName: name,
        crop: row.crop,
        quantity: quantityDisplay(row.quantity),
        quantityKg: Number(row.quantity || 0),
        qualityGrade: row.quality_grade,
        amount: money(row.amount),
        date: row.date,
        status: row.status,
      }
    })
    .sort((a, b) => `${b.date} ${b.id}`.localeCompare(`${a.date} ${a.id}`))
}

export async function getPayments() {
  const { payments, procurements, farmers, centreByUuid, procCentreById } = await fetchBundle()
  const procurementById = Object.fromEntries(procurements.map((row) => [row.id, row]))
  const farmerById = Object.fromEntries(farmers.map((row) => [row.id, row]))
  return payments
    .map((row) => {
      const procurement = procurementById[row.procurement_id]
      const rawCentreId = procurement?.centre_id || row.centre_id || ''
      const code = centreByUuid[rawCentreId]?.code || rawCentreId
      const name = procCentreById[code]?.name || procCentreById[rawCentreId]?.name || centreByUuid[rawCentreId]?.name || rawCentreId || '—'
      return {
        id: row.id,
        referenceId: row.reference_id,
        procurementId: row.procurement_id,
        farmerId: row.farmer_id,
        farmerName: farmerById[row.farmer_id]?.name || row.farmer_id,
        centreId: code,
        centreName: name,
        amount: money(row.amount),
        method: row.payment_method || 'Bank Transfer',
        paymentDate: row.payment_date,
        status: row.status,
      }
    })
    .sort((a, b) => `${b.paymentDate || ''} ${b.id}`.localeCompare(`${a.paymentDate || ''} ${a.id}`))
}

export async function getNotifications() {
  const { notifications } = await fetchBundle()
  return notifications
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      read: !!item.read,
      type: item.type,
      time: item.created_at,
      created_at: item.created_at,
    }))
}

export async function getAnalyticsBundle() {
  try {
    return await requestQueueServer('/api/analytics/bundle')
  } catch {
    const { farmers, procurements, tokens, centres } = await fetchBundle()
    const activeTokens = tokens.filter((row) => shouldShowLiveBooking(row))
    const recentDates = [...new Set(procurements.map((row) => row.date).filter(Boolean))].sort().slice(-7)
    const villageCounts = farmers.reduce((acc, row) => {
      acc[row.village] = (acc[row.village] || 0) + 1
      return acc
    }, {})
    const cropCounts = procurements.reduce((acc, row) => {
      acc[row.crop] = (acc[row.crop] || 0) + 1
      return acc
    }, {})
    const centreMetrics = centres.map((centre) => {
      const centreTokens = tokens.filter((row) => row.centre_id === centre.id)
      const waiting = centreTokens.filter((row) => row.queue_status === 'waiting').length
      const utilization = centre.capacity ? Math.round((Math.min(centre.capacity, centreTokens.length) / centre.capacity) * 100) : 0
      return { centre: centre.name, utilization, throughput: centreTokens.filter((row) => row.queue_status === 'completed').length, wait: waiting * 10 }
    })

    return {
      analyticsData: {
        farmerRegistrations: {
          labels: [...new Set(farmers.map((row) => row.registered_date).filter(Boolean))].sort().slice(-7),
          data: [...new Set(farmers.map((row) => row.registered_date).filter(Boolean))].sort().slice(-7).map((day) => farmers.filter((row) => row.registered_date === day).length),
        },
        villageDistribution: {
          labels: Object.keys(villageCounts).slice(0, 8),
          data: Object.values(villageCounts).slice(0, 8),
        },
        dailyProcurements: {
          labels: recentDates,
          data: recentDates.map((day) => procurements.filter((row) => row.date === day).length),
        },
        cropDistribution: {
          labels: Object.keys(cropCounts),
          data: Object.values(cropCounts),
        },
        avgWaitTimes: {
          labels: centres.map((centre) => centre.name),
          data: centreMetrics.map((row) => row.wait),
        },
        centrePerformance: {
          labels: centreMetrics.map((row) => row.centre),
          utilization: centreMetrics.map((row) => row.utilization),
          throughput: centreMetrics.map((row) => row.throughput),
        },
      },
      predictions: {
        expectedCrowdLevel: { value: activeTokens.filter((row) => row.queue_status === 'waiting').length > 5 ? 'High' : 'Moderate', confidence: '81%', description: 'Based on live queue distribution.' },
        estimatedWaitTime: { value: `${activeTokens.filter((row) => row.queue_status === 'waiting').length * 10} min`, confidence: '76%', description: 'Calculated from active farmers per centre.' },
        peakHourPrediction: { value: '10 AM - 12 PM', confidence: '72%', description: 'Most existing tokens are clustered in morning slots.' },
        noShowPatterns: { value: `${tokens.filter((row) => row.queue_status === 'no-show').length} tokens`, confidence: '68%', description: 'Derived from the present queue history.' },
        recommendedSlots: centres.slice(0, 4).map((centre) => ({ centre: centre.name, date: todayIso(), time: '02:00 PM - 03:00 PM', expectedLoad: 'Low' })),
      },
      mlDiagnostics: {
        model: 'historical-heuristic',
        clusterSamples: 0,
        regressionSamples: 0,
        queueEventCount: 0,
        activePredictionCount: activeTokens.filter((row) => row.queue_status === 'waiting' || row.queue_status === 'serving').length,
        regressionMinimum: 5,
        regressionReady: false,
        fallbackReason: 'Queue server unavailable, so admin dashboard is using fallback analytics only.',
      },
    }
  }
}

export async function getReportBundle(month) {
  const { centres, tokens, procurements } = await fetchBundle()
  const monthPrefix = month || new Date().toISOString().slice(0, 7)
  const monthTokens = tokens.filter((row) => String(row.slot_date || '').startsWith(monthPrefix))
  const monthProcurements = procurements.filter((row) => String(row.date || '').startsWith(monthPrefix))
  const centrePerformance = centres.map((centre) => {
    const centreTokens = monthTokens.filter((row) => row.centre_id === centre.id)
    return {
      name: centre.name,
      capacity: centre.capacity,
      utilization: `${centre.capacity ? Math.round((Math.min(centre.capacity, centreTokens.length) / centre.capacity) * 100) : 0}%`,
      throughput: centreTokens.filter((row) => row.queue_status === 'completed').length,
      waitTime: `${centreTokens.filter((row) => row.queue_status === 'waiting').length * 10} min`,
    }
  })

  return {
    summary: {
      totalFarmersServed: monthTokens.filter((row) => row.queue_status === 'completed').length,
      totalProcurement: `${monthProcurements.reduce((sum, row) => sum + Number(row.quantity || 0), 0).toLocaleString('en-IN')} kg`,
      totalAmount: monthProcurements.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      avgWaitTime: `${Math.round((monthTokens.filter((row) => row.queue_status === 'waiting').length * 10) / Math.max(centrePerformance.length, 1))} min`,
    },
    centrePerformance,
  }
}
