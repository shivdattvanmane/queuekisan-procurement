import { createRequire } from 'module'
import crypto from 'crypto'

const requireCounter = createRequire(new URL('../counter/package.json', import.meta.url))
const { io } = requireCounter('socket.io-client')

const SUPABASE_URL = ''
const SERVICE_KEY = ''
const API_BASE = 'http://127.0.0.1:8000/api'
const REST_BASE = `${SUPABASE_URL}/rest/v1`
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function parseResponse(response) {
  const text = await response.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!response.ok) throw new Error(data?.error?.message || data?.message || data?.detail || text || 'Request failed')
  return data
}

async function rest(method, table, { params = {}, body } = {}) {
  const url = new URL(`${REST_BASE}/${table}`)
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v))
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  return parseResponse(res)
}
const restPost = (table, body) => rest('POST', table, { body })
const restDelete = (table, params) => rest('DELETE', table, { params })
const restGet = (table, params) => rest('GET', table, { params })

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return parseResponse(res)
}

function waitFor(socket, eventName, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent)
      reject(new Error(`Timeout waiting for ${eventName}`))
    }, timeout)
    const onEvent = (payload) => {
      clearTimeout(timer)
      socket.off(eventName, onEvent)
      resolve(payload)
    }
    socket.on(eventName, onEvent)
  })
}

async function connectSocket(rooms) {
  const socket = io('http://127.0.0.1:8000', { path: '/socket.io', transports: ['websocket', 'polling'] })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 10000)
    socket.on('connect', () => {
      clearTimeout(timer)
      socket.emit('join', rooms)
      resolve()
    })
    socket.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
  return socket
}

const suffix = crypto.randomBytes(3).toString('hex').toUpperCase()
const centreId = `CTR-RT${suffix}`
const centreName = `Realtime Test Centre ${suffix}`
const officerId = `usr-rto-${suffix}`
const counterId = `CNT-RT${suffix}`
const mobileSeed = crypto.randomInt(10000000, 99999999)
const users = Array.from({ length: 3 }).map((_, i) => ({
  userId: `usr-rtf-${suffix}-${i + 1}`,
  farmerId: `FRM-RT${suffix}-${i + 1}`,
  mobile: `97${String(mobileSeed + i).slice(-8)}`,
  name: `Realtime Farmer ${i + 1}`,
}))

const officerPhone = `98${String(crypto.randomInt(10000000, 99999999))}`
const created = { centreUuid: null, slotId: null, bookingIds: [], paymentIds: [], procurementIds: [] }
const report = { ok: false, checks: [] }
function note(name, ok, details = {}) {
  report.checks.push({ name, ok, details })
  console.log(`${ok ? '✅' : '❌'} ${name}`, Object.keys(details).length ? JSON.stringify(details) : '')
  if (!ok) throw new Error(name)
}

let adminSocket, centreSocket, user1Socket, user3Socket

try {
  await restPost('procurement_centers', [{
    id: centreId,
    name: centreName,
    address: 'Arena QA Lane',
    taluka: 'Pune',
    district: 'Pune',
    status: 'active',
    capacity: 20,
    contact: '0000000000',
    coordinates: '18.52,73.85',
  }])
  created.centreUuid = (await restPost('centres', [{ name: centreName, code: centreId, location: 'Pune' }]))[0].id
  created.slotId = (await restPost('slots', [{ centre_id: created.centreUuid, crop_id: 3, slot_date: '2026-09-02', slot_time: '04:00 PM - 05:00 PM', capacity: 6, booked_count: 0 }]))[0].id
  await restPost('users', [{ id: officerId, email: `${officerId}@queuekisan.test`, phone: officerPhone, password_hash: 'temp1234', role: 'COUNTER_PERSON' }])
  await restPost('counters', [{ id: counterId, centre_id: centreId, counter_number: 'Counter RT', officer_id: officerId, status: 'active' }])
  for (const item of users) {
    await restPost('users', [{ id: item.userId, email: `${item.mobile}@rt.local`, phone: item.mobile, password_hash: 'temp1234', role: 'FARMER' }])
    await restPost('farmers', [{ id: item.farmerId, user_id: item.userId, name: item.name, mobile: item.mobile, village: 'Pune', taluka: 'Pune', district: 'Pune', registered_date: '2026-09-02' }])
  }

  adminSocket = await connectSocket(['admin:global'])
  centreSocket = await connectSocket([`centre:${centreId}`])
  user1Socket = await connectSocket([`user:${users[0].userId}`])
  user3Socket = await connectSocket([`user:${users[2].userId}`])
  note('Socket clients connected', true)

  const adminBookingEvent = waitFor(adminSocket, 'queue:updated')
  const centreBookingEvent = waitFor(centreSocket, 'queue:updated')
  const user1BookingNotif = waitFor(user1Socket, 'notification:new')
  const booking1 = await api('POST', '/bookings/create', { farmerId: users[0].farmerId, centreId, cropId: 3, slotId: created.slotId, quantityKg: 100 })
  created.bookingIds.push(booking1.booking.id)
  created.procurementIds.push(`PRC-${booking1.booking.id.replace(/[^A-Za-z0-9]/g, '')}`)
  note('Booking 1 created', !!booking1.booking.token, { bookingId: booking1.booking.id, token: booking1.booking.token })
  note('Admin received booking queue update', !!(await adminBookingEvent).bookingId)
  note('Centre received booking queue update', !!(await centreBookingEvent).bookingId)
  note('Farmer 1 received booking notification event', true, await user1BookingNotif)

  const booking2 = await api('POST', '/bookings/create', { farmerId: users[1].farmerId, centreId, cropId: 3, slotId: created.slotId, quantityKg: 110 })
  created.bookingIds.push(booking2.booking.id)
  created.procurementIds.push(`PRC-${booking2.booking.id.replace(/[^A-Za-z0-9]/g, '')}`)
  const booking3 = await api('POST', '/bookings/create', { farmerId: users[2].farmerId, centreId, cropId: 3, slotId: created.slotId, quantityKg: 120 })
  created.bookingIds.push(booking3.booking.id)
  created.procurementIds.push(`PRC-${booking3.booking.id.replace(/[^A-Za-z0-9]/g, '')}`)
  note('Booking 2 and 3 created', true, { booking2: booking2.booking.token, booking3: booking3.booking.token })

  const farmer3Notifications = await restGet('notifications', { select: 'title,message', user_id: `eq.${users[2].userId}`, order: 'created_at.desc' })
  note('Approaching notification stored for queued farmer', farmer3Notifications.some((n) => /approaching/i.test(`${n.title} ${n.message}`)))

  await api('POST', '/bookings/check-in', { bookingId: booking1.booking.id })
  await api('POST', '/bookings/check-in', { bookingId: booking2.booking.id })
  await api('POST', '/bookings/check-in', { bookingId: booking3.booking.id })
  note('All three bookings checked in', true)

  const calledEvt = waitFor(user1Socket, 'token:called')
  const calledNotifEvt = waitFor(user1Socket, 'notification:new')
  const called = await api('POST', '/queue/call-next', { officerId })
  note('Call-next moved token to serving', called.farmer.queueStatus === 'serving', { token: called.farmer.token })
  note('Farmer 1 received token called event', (await calledEvt).bookingId === booking1.booking.id)
  note('Farmer 1 received token called notification event', true, await calledNotifEvt)

  const pos3 = await api('GET', `/bookings/position/${booking3.booking.id}`)
  note('Farmer 3 queue position recalculated', pos3.farmersAhead >= 1, { farmersAhead: pos3.farmersAhead, eta: pos3.estimatedWaitMinutes })

  const procStartEvt = waitFor(adminSocket, 'procurement:started')
  const payEvt = waitFor(user1Socket, 'payment:updated')
  await api('POST', '/queue/produce', { officerId, bookingId: booking1.booking.id, payload: { crop: 'Wheat', quantity: 100, quality: 'Grade A', moisture: '12', remarks: 'Realtime QA' } })
  await api('POST', '/queue/procurement/start', { officerId, bookingId: booking1.booking.id })
  note('Admin received procurement-started event', (await procStartEvt).bookingId === booking1.booking.id)
  await api('POST', '/queue/procurement/confirm', { officerId, bookingId: booking1.booking.id, payload: { quantity: 100, amount: 4500, quality: 'Grade A' } })
  await api('POST', '/queue/procurement/complete', { officerId, bookingId: booking1.booking.id, payload: { quantity: 100, amount: 4500, quality: 'Grade A' } })
  const payment = await api('POST', '/queue/payment', { officerId, bookingId: booking1.booking.id, payload: { status: 'completed', referenceId: `REF-RT-${suffix}`, amount: 4500, paymentDate: new Date().toISOString() } })
  created.paymentIds.push(`PAY-PRC${booking1.booking.id.replace(/[^A-Za-z0-9]/g, '')}`)
  note('Payment completed via queue server', payment.farmer.paymentStatus === 'completed', { referenceId: payment.farmer.referenceId })
  note('Farmer 1 received payment-updated event', (await payEvt).bookingId === booking1.booking.id)

  report.ok = true
} finally {
  for (const socket of [adminSocket, centreSocket, user1Socket, user3Socket]) {
    try { socket?.disconnect() } catch {}
  }
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
}

console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)
