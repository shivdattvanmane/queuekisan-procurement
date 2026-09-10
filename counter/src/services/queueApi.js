import { restInsert, restSelect, restUpdate } from './platform'

const STORAGE_KEY = 'queuekisan_counter_session'
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

function getSessionOfficer() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function localIsoDate(value = new Date()) {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const todayIso = () => localIsoDate()
const ACTIVE_QUEUE_STATUSES = new Set(['waiting', 'serving'])

function estimateWait(positionAhead) {
  return positionAhead <= 0 ? 'Now' : `${positionAhead * 10} min`
}

function formatQuantity(value) {
  return Number(value || 0)
}

function normalizeProcurementStatus(status) {
  if (!status) return 'pending'
  return status
}

function shouldShowAtCounter(row, today) {
  if (!row?.slot_date) return false
  return row.slot_date >= today || ACTIVE_QUEUE_STATUSES.has(row.queue_status)
}

function titleCase(value = '') {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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

async function getOfficerBundle(officerId) {
  const officerRows = await restSelect('users', { select: '*', id: `eq.${String(officerId).trim()}`, role: 'eq.COUNTER_PERSON' })
  const officer = officerRows[0]
  if (!officer) throw new Error('Please sign in again.')

  const counterRows = await restSelect('counters', { select: '*', officer_id: `eq.${officer.id}` })
  const counter = counterRows[0]
  if (!counter) throw new Error('No counter is assigned to this officer.')

  const centreRows = await restSelect('procurement_centers', { select: '*', id: `eq.${counter.centre_id}` })
  const centre = centreRows[0]
  if (!centre) throw new Error('Assigned centre not found.')

  return { officer, counter, centre }
}

async function fetchCentreData(officerId) {
  const { officer, counter, centre } = await getOfficerBundle(officerId)
  const [tokens, farmers, procurements, payments, notifications, centres, paymentProfilesByFarmer] = await Promise.all([
    restSelect('queue_tokens', { select: '*' }),
    restSelect('farmers', { select: '*' }),
    restSelect('procurements', { select: '*' }),
    restSelect('payments', { select: '*' }),
    restSelect('notifications', { select: '*', order: 'created_at.desc', limit: '25' }),
    restSelect('procurement_centers', { select: 'id,name' }),
    getPaymentProfilesByFarmer(),
  ])

  const farmerById = Object.fromEntries(farmers.map((row) => [row.id, row]))
  const procurementByToken = Object.fromEntries(procurements.map((row) => [row.token_id, row]))
  const paymentByProcurement = Object.fromEntries(payments.map((row) => [row.procurement_id, row]))
  const centreById = Object.fromEntries(centres.map((row) => [row.id, row]))
  const today = todayIso()
  const queue = tokens
    .filter((row) => {
      const matchesCentre = row.centre_id === centre.id || row.centre_id === counter.centre_id
      if (!matchesCentre) return false
      if (row.counter_id && counter?.id && String(row.counter_id) !== String(counter.id)) {
        return false
      }
      return shouldShowAtCounter(row, today)
    })
    .map((row) => {
      const farmer = farmerById[row.farmer_id]
      const procurement = procurementByToken[row.id]
      const payment = paymentByProcurement[procurement?.id]
      const rowCentre = centreById[row.centre_id] || (row.centre_id === centre.id ? centre : null)
      return {
        id: String(row.id),
        bookingRowId: String(row.id),
        bookingId: String(row.id),
        token: row.token_number,
        farmerId: row.farmer_id,
        farmerName: farmer?.name || row.farmer_id,
        mobile: farmer?.mobile || '',
        village: farmer?.village || '',
        crop: procurement?.crop || 'Not recorded',
        quantityKg: formatQuantity(procurement?.quantity),
        quantityDisplay: `${formatQuantity(procurement?.quantity).toLocaleString('en-IN')} kg`,
        unit: 'kg',
        slot: row.slot_time,
        date: row.slot_date,
        centreId: row.centre_id,
        centreName: rowCentre?.name || row.centre_id,
        isAssignedCentre: true,
        checkIn: row.check_in_status,
        queueStatus: row.queue_status,
        procurementStatus: normalizeProcurementStatus(procurement?.status),
        paymentStatus: payment?.status || 'pending',
        amount: Number(procurement?.amount || payment?.amount || 0),
        quality: procurement?.quality_grade || '',
        moisture: procurement?.moisture_content || '',
        remarks: procurement?.variety || procurement?.remarks || '',
        referenceId: payment?.reference_id || '',
        paymentDate: payment?.payment_date || '',
        paymentProfile: paymentProfilesByFarmer[row.farmer_id] || null,
        counterId: row.counter_id || '',
      }
    })
    .sort((a, b) => {
      if (a.isAssignedCentre !== b.isAssignedCentre) return a.isAssignedCentre ? -1 : 1
      const priority = { serving: 0, waiting: 1, completed: 2, skipped: 3, 'no-show': 4 }
      const pa = priority[a.queueStatus] ?? 9
      const pb = priority[b.queueStatus] ?? 9
      if (pa !== pb) return pa - pb
      if (a.queueStatus === 'waiting' && b.queueStatus === 'waiting') {
        if (a.checkIn === 'checked-in' && b.checkIn !== 'checked-in') return -1
        if (a.checkIn !== 'checked-in' && b.checkIn === 'checked-in') return 1
      }
      return `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`)
    })

  const relatedNotifications = notifications
    .filter((item) => queue.some((row) => farmerById[row.farmerId]?.user_id === item.user_id) || centres.some((row) => item.message?.includes(row.name)))
    .map((item) => ({ id: item.id, text: item.message, time: item.created_at, read: !!item.read }))

  return {
    officer,
    counter,
    centre,
    queue,
    notifications: relatedNotifications,
  }
}

async function findQueueRecord(idOrFarmerId, officerId) {
  const data = await fetchCentreData(officerId)
  const row = data.queue.find((item) => item.id === String(idOrFarmerId) || item.farmerId === String(idOrFarmerId) || item.bookingId === String(idOrFarmerId))
  if (!row) throw new Error('Booking not found.')
  return { ...data, row }
}

async function patchQueuePositions(centreId, slotDate) {
  const tokens = await restSelect('queue_tokens', { select: '*', centre_id: `eq.${centreId}`, slot_date: `eq.${slotDate}` })
  const waiting = tokens
    .filter((row) => row.queue_status === 'waiting')
    .sort((a, b) => {
      if (a.check_in_status === 'checked-in' && b.check_in_status !== 'checked-in') return -1
      if (a.check_in_status !== 'checked-in' && b.check_in_status === 'checked-in') return 1
      return `${a.slot_date} ${a.slot_time}`.localeCompare(`${b.slot_date} ${b.slot_time}`)
    })

  for (const row of tokens.filter((item) => item.queue_status === 'serving')) {
    await restUpdate('queue_tokens', { id: `eq.${row.id}` }, { position_ahead: 0, estimated_wait_time: 'Now' })
  }
  for (const [index, row] of waiting.entries()) {
    await restUpdate('queue_tokens', { id: `eq.${row.id}` }, { position_ahead: index, estimated_wait_time: estimateWait(index) })
  }
}

async function ensureNotificationForFarmer(farmerId, title, message, type = 'info') {
  const farmerRows = await restSelect('farmers', { select: '*', id: `eq.${farmerId}` })
  const farmer = farmerRows[0]
  if (!farmer?.user_id) return
  await restInsert('notifications', { user_id: farmer.user_id, title, message, read: false, type })
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
    payment_date: payload.paymentDate ? localIsoDate(payload.paymentDate) : (found[0]?.payment_date || todayIso()),
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

function packageResponse(data) {
  const queue = data.queue || []
  const serving = queue.find((item) => item.queueStatus === 'serving')
  const waitingCheckedIn = queue.filter((item) => item.queueStatus === 'waiting' && item.checkIn === 'checked-in')
  return {
    queue,
    stats: {
      total: queue.length,
      waiting: queue.filter((item) => item.queueStatus === 'waiting').length,
      serving: serving || null,
      completed: queue.filter((item) => item.queueStatus === 'completed').length,
      skipped: queue.filter((item) => item.queueStatus === 'skipped').length,
      noShow: queue.filter((item) => item.queueStatus === 'no-show').length,
      nextInQueue: waitingCheckedIn[0] || queue.find((item) => item.queueStatus === 'waiting') || null,
      estimatedWaitMinutes: waitingCheckedIn.length * 10,
      pendingPayments: queue.filter((item) => item.paymentStatus && item.paymentStatus !== 'completed').length,
    },
    notifications: data.notifications || [],
    centre: data.centre ? { id: data.centre.id, name: data.centre.name } : null,
  }
}

export async function getQueue() {
  const officer = getSessionOfficer()
  if (!officer?.id) return { queue: [], stats: {}, notifications: [] }
  try {
    return await requestQueueServer(`/api/queue/officer/${encodeURIComponent(officer.id)}`)
  } catch (error) {
    const data = await fetchCentreData(officer.id)
    return packageResponse(data)
  }
}

export async function verifyFarmer(idOrFarmerId) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    const result = await requestQueueServer('/api/queue/verify', { method: 'POST', body: { officerId: officer.id, bookingId } })
    const fresh = await getQueue()
    return { farmer: result.farmer, ...fresh }
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { check_in_status: 'checked-in', verification_status: 'completed' })
    await ensureNotificationForFarmer(data.row.farmerId, 'Check-in confirmed', `Your check-in has been verified for token ${data.row.token}.`, 'success')
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id), ...packageResponse(refreshed) }
  }
}

export async function callNextToken() {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const result = await requestQueueServer('/api/queue/call-next', { method: 'POST', body: { officerId: officer.id } })
    const fresh = await getQueue()
    return { farmer: result.farmer, ...fresh }
  } catch (serverError) {
    const data = await fetchCentreData(officer.id)
    const currentServing = data.queue.find((item) => item.isAssignedCentre && item.queueStatus === 'serving')
    if (currentServing) throw new Error('Complete the current token before calling the next one.')
    const next = data.queue.find((item) => item.isAssignedCentre && item.queueStatus === 'waiting' && item.checkIn === 'checked-in')
      || data.queue.find((item) => item.isAssignedCentre && item.queueStatus === 'waiting')
      || data.queue.find((item) => item.queueStatus === 'waiting' && item.checkIn === 'checked-in')
      || data.queue.find((item) => item.queueStatus === 'waiting')
    if (!next) throw new Error('No waiting farmers available.')

    await restUpdate('queue_tokens', { id: `eq.${next.id}` }, { queue_status: 'serving', counter_id: data.counter.id, position_ahead: 0, estimated_wait_time: 'Now' })
    await patchQueuePositions(next.centreId, next.date)
    await ensureNotificationForFarmer(next.farmerId, 'Token in service', `Please proceed to ${next.centreName}. Token ${next.token} is now being served.`, 'info')
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === next.id), ...packageResponse(refreshed) }
  }
}

export async function directProcessToken(idOrFarmerId) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    const result = await requestQueueServer('/api/queue/direct-process', { method: 'POST', body: { officerId: officer.id, bookingId } })
    const fresh = await getQueue()
    return { farmer: result.farmer, ...fresh }
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { queue_status: 'serving', counter_id: data.counter.id, position_ahead: 0, estimated_wait_time: 'Now' })
    await patchQueuePositions(data.centre.id, data.row.date)
    await ensureNotificationForFarmer(data.row.farmerId, 'Token in service', `Please proceed to counter ${data.counter.counter_number || '1'} at ${data.centre.name}. Token ${data.row.token} is now being served.`, 'info')
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id), ...packageResponse(refreshed) }
  }
}

export async function applyQueueAction(idOrFarmerId, action) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    const result = await requestQueueServer('/api/queue/action', { method: 'POST', body: { officerId: officer.id, bookingId, action } })
    const fresh = await getQueue()
    return { farmer: result.farmer, ...fresh }
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)

    if (action === 'skip') {
      await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { queue_status: 'skipped', counter_id: data.counter.id })
      await ensureNotificationForFarmer(data.row.farmerId, 'Token skipped', `Your token ${data.row.token} was marked skipped. Please contact the counter if you need assistance.`, 'warning')
    } else if (action === 'no-show') {
      await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { queue_status: 'no-show', counter_id: data.counter.id })
      await ensureNotificationForFarmer(data.row.farmerId, 'No-show recorded', `Your token ${data.row.token} was marked as no-show for today.`, 'warning')
    } else if (action === 'rejoin') {
      await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { queue_status: 'waiting', counter_id: null })
      await ensureNotificationForFarmer(data.row.farmerId, 'Queue rejoined', `Your token ${data.row.token} has been placed back into the waiting queue.`, 'success')
    } else {
      throw new Error('Unsupported queue action.')
    }

    await patchQueuePositions(data.centre.id, data.row.date)
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id), ...packageResponse(refreshed) }
  }
}

export async function submitProduceEntry(idOrFarmerId, payload) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    return await requestQueueServer('/api/queue/produce', { method: 'POST', body: { officerId: officer.id, bookingId, payload } })
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    const procurement = await ensureProcurement(data.row)
    await restUpdate('procurements', { id: `eq.${procurement.id}` }, {
      crop: payload.crop || (data.row.crop === 'Not recorded' ? 'Wheat' : data.row.crop),
      quantity: Number(payload.quantity || 0),
      quality_grade: payload.quality || data.row.quality || 'Grade A',
      moisture_content: payload.moisture || '',
      variety: payload.remarks || procurement.variety || 'Standard',
      status: procurement.status === 'completed' ? 'completed' : 'pending',
      amount: Number(procurement.amount || 0),
    })
    await ensureNotificationForFarmer(data.row.farmerId, 'Produce details updated', `Produce details for token ${data.row.token} were recorded successfully.`, 'success')
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id) }
  }
}

export async function startProcurement(idOrFarmerId) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    return await requestQueueServer('/api/queue/procurement/start', { method: 'POST', body: { officerId: officer.id, bookingId } })
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    const procurement = await ensureProcurement(data.row)
    await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { queue_status: 'serving', counter_id: data.counter.id })
    await restUpdate('procurements', { id: `eq.${procurement.id}` }, { status: 'in-progress' })
    await ensureNotificationForFarmer(data.row.farmerId, 'Procurement started', `Procurement has started for token ${data.row.token}.`, 'info')
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id) }
  }
}

export async function confirmAmount(idOrFarmerId, payload) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    return await requestQueueServer('/api/queue/procurement/confirm', { method: 'POST', body: { officerId: officer.id, bookingId, payload } })
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    const procurement = await ensureProcurement(data.row)
    const finalQuantity = Number(payload.quantity !== undefined ? payload.quantity : (procurement.quantity || data.row.quantityKg || 0))
    const finalAmount = Number(payload.amount !== undefined ? payload.amount : (procurement.amount || 0))
    await restUpdate('procurements', { id: `eq.${procurement.id}` }, {
      quantity: finalQuantity,
      amount: finalAmount,
      quality_grade: payload.quality || procurement.quality_grade || 'Grade A',
      status: 'in-progress',
    })
    await ensureNotificationForFarmer(data.row.farmerId, 'Amount confirmed', `The estimated procurement amount of ₹${finalAmount.toLocaleString('en-IN')} for token ${data.row.token} has been confirmed.`, 'info')
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id) }
  }
}

export async function completeProcurement(idOrFarmerId, payload) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    return await requestQueueServer('/api/queue/procurement/complete', { method: 'POST', body: { officerId: officer.id, bookingId, payload } })
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    const procurement = await ensureProcurement(data.row)
    const finalAmount = Number(payload.amount !== undefined ? payload.amount : (procurement.amount || 0))
    const finalQuantity = Number(payload.quantity !== undefined ? payload.quantity : (procurement.quantity || data.row.quantityKg || 0))
    await restUpdate('procurements', { id: `eq.${procurement.id}` }, {
      quantity: finalQuantity,
      amount: finalAmount,
      quality_grade: payload.quality || procurement.quality_grade || 'Grade A',
      status: 'completed',
      date: todayIso(),
    })
    await restUpdate('queue_tokens', { id: `eq.${data.row.id}` }, { queue_status: 'completed', counter_id: data.counter.id, position_ahead: 0, estimated_wait_time: 'Done' })
    const payment = await ensurePayment({ ...procurement, quantity: finalQuantity, amount: finalAmount }, data.row, { status: 'processing', amount: finalAmount })
    await ensureNotificationForFarmer(data.row.farmerId, 'Procurement completed', `Procurement of ${finalQuantity} kg has been completed for token ${data.row.token}. Payment reference ${payment.reference_id} is now processing.`, 'success')
    await patchQueuePositions(data.centre.id, data.row.date)
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id) }
  }
}

export async function updatePayment(idOrFarmerId, payload) {
  const officer = getSessionOfficer()
  if (!officer?.id) throw new Error('Please sign in again.')
  try {
    const bookingId = String(idOrFarmerId)
    const result = await requestQueueServer('/api/queue/payment', { method: 'POST', body: { officerId: officer.id, bookingId, payload } })
    const fresh = await getQueue()
    return { farmer: result.farmer, ...fresh }
  } catch (serverError) {
    const data = await findQueueRecord(idOrFarmerId, officer.id)
    const procurement = await ensureProcurement(data.row)
    const payment = await ensurePayment(procurement, data.row, payload)
    await restInsert('payment_status_history', {
      payment_id: payment.id,
      status: payload.status || payment.status,
      remarks: `Updated by counter ${data.counter.counter_number}: ${titleCase(payload.status || payment.status)}`,
    })
    if ((payload.status || payment.status) === 'completed') {
      await ensureNotificationForFarmer(data.row.farmerId, 'Payment transferred', `Payment of ₹${Number(payload.amount ?? payment.amount ?? 0).toLocaleString('en-IN')} has been marked completed. Reference ID: ${payload.referenceId || payment.reference_id}.`, 'success')
    } else {
      await ensureNotificationForFarmer(data.row.farmerId, 'Payment update', `Payment status for token ${data.row.token} is now ${payload.status || payment.status}.`, 'info')
    }
    const refreshed = await fetchCentreData(officer.id)
    return { farmer: refreshed.queue.find((item) => item.id === data.row.id), ...packageResponse(refreshed) }
  }
}
