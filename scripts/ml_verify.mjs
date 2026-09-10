import crypto from 'crypto'

const SUPABASE_URL = ''
const SERVICE_KEY = ''
const API_BASE = 'http://127.0.0.1:8000/api'
const REST_BASE = `${SUPABASE_URL}/rest/v1`
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  Accept: 'application/json',
}
const HJ = { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' }

async function parseResponse(response) {
  const text = await response.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!response.ok) throw new Error(data?.error?.message || data?.message || data?.detail || text || 'Request failed')
  return data
}

async function rest(method, table, { params = {}, body } = {}) {
  const url = new URL(`${REST_BASE}/${table}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })
  const res = await fetch(url, { method, headers: body ? HJ : H, body: body ? JSON.stringify(body) : undefined })
  return parseResponse(res)
}

const restGet = (table, params) => rest('GET', table, { params })
const restPost = (table, body) => rest('POST', table, { body })
const restDelete = (table, params) => rest('DELETE', table, { params })

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return parseResponse(res)
}

const suffix = crypto.randomBytes(3).toString('hex').toUpperCase()
const centreId = `CTR-ML${suffix}`
const centreName = `ML Verify Centre ${suffix}`
const officerId = `usr-mlo-${suffix}`
const officerPhone = `98${String(crypto.randomInt(10000000, 99999999))}`
const counterId = `CNT-ML${suffix}`
const created = { centreUuid: null, slotId: null, bookingIds: [], procurementIds: [], paymentIds: [] }
const report = { ok: false, checks: [] }
const queueDate = '2026-09-02'

function note(name, ok, details = {}) {
  report.checks.push({ name, ok, details })
  console.log(`${ok ? '✅' : '❌'} ${name}`, Object.keys(details).length ? JSON.stringify(details) : '')
  if (!ok) throw new Error(name)
}

const users = Array.from({ length: 6 }).map((_, index) => {
  const mobile = `97${String(crypto.randomInt(10000000, 99999999))}`
  return {
    userId: `usr-mlf-${suffix}-${index + 1}`,
    farmerId: `FRM-ML${suffix}-${index + 1}`,
    mobile,
    email: `${mobile}@ml.local`,
    name: `ML Farmer ${index + 1}`,
  }
})

try {
  await restPost('procurement_centers', [{
    id: centreId,
    name: centreName,
    address: 'Arena ML Lane',
    taluka: 'Pune',
    district: 'Pune',
    status: 'active',
    capacity: 20,
    contact: officerPhone,
    coordinates: '18.52,73.85',
  }])
  created.centreUuid = (await restPost('centres', [{ name: centreName, code: centreId, location: 'Pune' }]))[0].id
  created.slotId = (await restPost('slots', [{ centre_id: created.centreUuid, crop_id: 3, slot_date: queueDate, slot_time: '07:00 PM - 08:00 PM', capacity: 10, booked_count: 0 }]))[0].id
  await restPost('users', [{ id: officerId, email: `${officerId}@queuekisan.test`, phone: officerPhone, password_hash: 'temp1234', role: 'COUNTER_PERSON' }])
  await restPost('counters', [{ id: counterId, centre_id: centreId, counter_number: 'Counter ML', officer_id: officerId, status: 'active' }])

  for (const item of users) {
    await restPost('users', [{ id: item.userId, email: item.email, phone: item.mobile, password_hash: 'temp1234', role: 'FARMER' }])
    await restPost('farmers', [{ id: item.farmerId, user_id: item.userId, name: item.name, mobile: item.mobile, village: 'Pune', taluka: 'Pune', district: 'Pune', registered_date: queueDate }])
  }
  note('Seeded temp centre, officer, and farmers', true, { centreId, farmers: users.length })

  for (let i = 0; i < 5; i += 1) {
    const qty = 100 + (i * 25)
    const booking = await api('POST', '/bookings/create', { farmerId: users[i].farmerId, centreId, cropId: 3, slotId: created.slotId, quantityKg: qty })
    created.bookingIds.push(booking.booking.id)
    created.procurementIds.push(`PRC-${booking.booking.id.replace(/[^A-Za-z0-9]/g, '')}`)
    await api('POST', '/bookings/check-in', { bookingId: booking.booking.id })
    await api('POST', '/queue/produce', { officerId, bookingId: booking.booking.id, payload: { crop: 'Wheat', quantity: qty, quality: i % 2 === 0 ? 'Grade A' : 'Grade B', moisture: String(10 + i), remarks: `ML sample ${i + 1}` } })
    await api('POST', '/queue/procurement/start', { officerId, bookingId: booking.booking.id })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await api('POST', '/queue/procurement/confirm', { officerId, bookingId: booking.booking.id, payload: { quantity: qty, amount: qty * 42, quality: i % 2 === 0 ? 'Grade A' : 'Grade B' } })
    await api('POST', '/queue/procurement/complete', { officerId, bookingId: booking.booking.id, payload: { quantity: qty, amount: qty * 42, quality: i % 2 === 0 ? 'Grade A' : 'Grade B' } })
    await api('POST', '/queue/payment', { officerId, bookingId: booking.booking.id, payload: { status: 'completed', referenceId: `REF-ML-${suffix}-${i + 1}`, amount: qty * 42, paymentDate: new Date().toISOString() } })
    created.paymentIds.push(`PAY-${created.procurementIds[created.procurementIds.length - 1].replace(/[^A-Za-z0-9]/g, '')}`)
  }
  note('Created labeled completed runs', true, { completedRuns: 5 })

  const probeBooking = await api('POST', '/bookings/create', { farmerId: users[5].farmerId, centreId, cropId: 3, slotId: created.slotId, quantityKg: 260 })
  created.bookingIds.push(probeBooking.booking.id)
  created.procurementIds.push(`PRC-${probeBooking.booking.id.replace(/[^A-Za-z0-9]/g, '')}`)
  await api('POST', '/bookings/check-in', { bookingId: probeBooking.booking.id })
  note('Created active probe booking', true, { bookingId: probeBooking.booking.id, token: probeBooking.booking.token })

  const diagnostics = await api('GET', '/analytics/ml-diagnostics')
  note('Regression diagnostics active', diagnostics.model === 'hybrid_ml' && Number(diagnostics.regressionSamples || 0) >= 5, diagnostics)

  const queuePosition = await api('GET', `/bookings/position/${probeBooking.booking.id}`)
  note('Probe booking uses ML-backed ETA', queuePosition.predictionSource === 'ml-hybrid', {
    predictionSource: queuePosition.predictionSource,
    predictionModel: queuePosition.predictionModel,
    loadCluster: queuePosition.loadCluster,
    estimatedWaitMinutes: queuePosition.estimatedWaitMinutes,
    predictedServiceMinutes: queuePosition.predictedServiceMinutes,
  })

  report.ok = true
} finally {
  for (const paymentId of created.paymentIds) {
    await restDelete('payment_status_history', { payment_id: `eq.${paymentId}` }).catch(() => {})
    await restDelete('payments', { id: `eq.${paymentId}` }).catch(() => {})
  }
  for (const procId of created.procurementIds) await restDelete('procurements', { id: `eq.${procId}` }).catch(() => {})
  for (const bookingId of created.bookingIds) await restDelete('queue_tokens', { id: `eq.${bookingId}` }).catch(() => {})
  if (created.slotId) await restDelete('slots', { id: `eq.${created.slotId}` }).catch(() => {})
  if (counterId) await restDelete('counters', { id: `eq.${counterId}` }).catch(() => {})
  for (const item of users) {
    await restDelete('notifications', { user_id: `eq.${item.userId}` }).catch(() => {})
    await restDelete('farmers', { id: `eq.${item.farmerId}` }).catch(() => {})
    await restDelete('users', { id: `eq.${item.userId}` }).catch(() => {})
  }
  if (officerId) await restDelete('users', { id: `eq.${officerId}` }).catch(() => {})
  if (created.centreUuid) await restDelete('centres', { id: `eq.${created.centreUuid}` }).catch(() => {})
  if (centreId) await restDelete('procurement_centers', { id: `eq.${centreId}` }).catch(() => {})
  await restDelete('queue_token_counters', { centre_id: `eq.${centreId}`, queue_date: `eq.${queueDate}` }).catch(() => {})
}

console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)
