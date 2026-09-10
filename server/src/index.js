import 'dotenv/config'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import express from 'express'
import OpenAI from 'openai';
import {
  buildQueueResponse,
  callNext,
  directProcess,
  checkInBooking,
  completeProcurement,
  confirmAmount,
  createBooking,
  getActiveBookingForFarmer,
  getActiveBookingsForFarmer,
  getAnalytics,
  getMlDiagnostics,
  getQueuePosition,
  startProcurement,
  submitProduce,
  updateBookingAction,
  updatePayment,
  verifyFarmer,
} from './services/queueEngine.js'
import { createSocketServer } from './socket.js'
import { emailService } from './services/emailService.js'
import { getChatbotResponse } from './services/chatbotResponses.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const app = express()
const server = http.createServer(app)
const realtime = createSocketServer(server)
const PORT = Number(process.env.PORT || 8000)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const farmerAppDir = path.join(repoRoot, 'farmer')

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))

function sendError(res, error) {
  console.error('[QueueServer]', error)
  res.status(error.status || 500).json({ error: error.message || 'Request failed', details: error.payload || null })
}

function lifecyclePayload(result) {
  return {
    bookingId: result.bookingId,
    centreId: result.centreId,
    farmerId: result.farmerId,
    userId: result.userId,
    token: result.booking?.token || result.booking?.tokenNumber || '',
    queueStatus: result.booking?.queueStatus || '',
    procurementStatus: result.booking?.procurementStatus || '',
    paymentStatus: result.booking?.paymentStatus || '',
    farmersAhead: result.booking?.farmersAhead ?? null,
    estimatedWaitMinutes: result.booking?.estimatedWaitMinutes ?? null,
    centreName: result.booking?.centreName || '',
  }
}

async function broadcastAnalytics() {
  try {
    const analytics = await getAnalytics()
    realtime.broadcast('analytics:updated', analytics, {})
  } catch (error) {
    console.warn('[QueueServer] Unable to broadcast analytics update:', error.message)
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'queuekisan-queue-server' })
})

app.get('/api/queue/officer/:officerId', async (req, res) => {
  try {
    const data = await buildQueueResponse(req.params.officerId)
    res.json(data)
  } catch (error) {
    sendError(res, error)
  }
})

app.get('/api/bookings/active/:farmerId', async (req, res) => {
  try {
    const preferredId = req.query.bookingId || null
    const booking = await getActiveBookingForFarmer(req.params.farmerId, preferredId)
    res.json({ booking })
  } catch (error) {
    sendError(res, error)
  }
})

app.get('/api/bookings/active-all/:farmerId', async (req, res) => {
  try {
    const bookings = await getActiveBookingsForFarmer(req.params.farmerId)
    res.json({ bookings })
  } catch (error) {
    sendError(res, error)
  }
})

app.get('/api/bookings/position/:bookingId', async (req, res) => {
  try {
    const position = await getQueuePosition(req.params.bookingId)
    res.json(position)
  } catch (error) {
    sendError(res, error)
  }
})

app.get('/api/analytics/bundle', async (req, res) => {
  try {
    const analytics = await getAnalytics()
    res.json(analytics)
  } catch (error) {
    sendError(res, error)
  }
})

app.get('/api/analytics/ml-diagnostics', async (req, res) => {
  try {
    const diagnostics = await getMlDiagnostics()
    res.json(diagnostics)
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/bookings/create', async (req, res) => {
  try {
    const result = await createBooking(req.body || {})
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('notification:new', { title: 'Token Generated', bookingId: payload.bookingId }, payload)
    await broadcastAnalytics()
    res.json({ booking: result.booking })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/bookings/check-in', async (req, res) => {
  try {
    const result = await checkInBooking(req.body?.bookingId)
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('token:verified', payload, payload)
    realtime.broadcast('notification:new', { title: 'Check-in confirmed', bookingId: payload.bookingId }, payload)
    await broadcastAnalytics()
    res.json({ booking: result.booking })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/call-next', async (req, res) => {
  try {
    const result = await callNext(req.body?.officerId)
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('token:called', payload, payload)
    realtime.broadcast('notification:new', { title: 'Token in service', bookingId: payload.bookingId }, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/direct-process', async (req, res) => {
  try {
    const result = await directProcess(req.body?.officerId, req.body?.bookingId)
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('token:called', payload, payload)
    realtime.broadcast('notification:new', { title: 'Token in service', bookingId: payload.bookingId }, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/action', async (req, res) => {
  try {
    const result = await updateBookingAction(req.body?.officerId, req.body?.bookingId, req.body?.action)
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast(`token:${req.body?.action}`, payload, payload)
    realtime.broadcast('notification:new', { title: titleCase(req.body?.action || 'queue updated'), bookingId: payload.bookingId }, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/verify', async (req, res) => {
  try {
    const result = await verifyFarmer(req.body?.officerId, req.body?.bookingId)
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('token:verified', payload, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/produce', async (req, res) => {
  try {
    const result = await submitProduce(req.body?.officerId, req.body?.bookingId, req.body?.payload || {})
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('procurement:details_updated', payload, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/procurement/start', async (req, res) => {
  try {
    const result = await startProcurement(req.body?.officerId, req.body?.bookingId)
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('procurement:started', payload, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/procurement/confirm', async (req, res) => {
  try {
    const result = await confirmAmount(req.body?.officerId, req.body?.bookingId, req.body?.payload || {})
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('procurement:amount_confirmed', payload, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/procurement/complete', async (req, res) => {
  try {
    const result = await completeProcurement(req.body?.officerId, req.body?.bookingId, req.body?.payload || {})
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('procurement:completed', payload, payload)
    realtime.broadcast('payment:updated', { ...payload, paymentStatus: 'processing' }, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/queue/payment', async (req, res) => {
  try {
    const result = await updatePayment(req.body?.officerId, req.body?.bookingId, req.body?.payload || {})
    const payload = lifecyclePayload(result)
    realtime.broadcast('queue:updated', payload, payload)
    realtime.broadcast('payment:updated', payload, payload)
    realtime.broadcast('notification:new', { title: 'Payment update', bookingId: payload.bookingId }, payload)
    await broadcastAnalytics()
    res.json({ farmer: result.booking, refresh: true })
  } catch (error) {
    sendError(res, error)
  }
})

// ==========================================
// EMAIL NOTIFICATION ENDPOINTS
// ==========================================
app.get('/api/notifications/email-status', async (req, res) => {
  try {
    const configured = emailService.isConfigured()
    const verification = await emailService.verifyConnection()
    res.json({
      enabled: process.env.NOTIFICATION_EMAIL_ENABLED !== 'false',
      configured,
      user: process.env.EMAIL_USER ? `${process.env.EMAIL_USER.slice(0, 3)}***@${process.env.EMAIL_USER.split('@')[1] || ''}` : null,
      verification,
    })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/notifications/test-email', async (req, res) => {
  try {
    const targetEmail = req.body?.to || process.env.EMAIL_USER
    if (!targetEmail) {
      return res.status(400).json({ error: 'Target email address is required.' })
    }
    const result = await emailService.sendBookingConfirmationEmail({
      to: targetEmail,
      farmerName: req.body?.farmerName || 'Farmer Test',
      tokenNumber: req.body?.tokenNumber || 'T-TEST-001',
      crop: req.body?.crop || 'Wheat (Test)',
      centre: req.body?.centre || 'Main APMC Market Yard',
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      slot: '10:00 AM – 11:00 AM',
      bookingId: 'TEST-BKG-12345',
    })
    res.json({ success: true, result, target: targetEmail })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/notifications/send-email', async (req, res) => {
  try {
    let { to, type, data } = req.body || {}
    if (!to || to.endsWith('@farmers.local') || to.endsWith('@farmers.queuekisan.in')) {
      to = process.env.EMAIL_USER
    }
    if (!to) {
      return res.status(400).json({ error: 'Recipient "to" email is required or EMAIL_USER must be set in .env' })
    }

    let result
    if (type === 'booking_confirmation') {
      result = await emailService.sendBookingConfirmationEmail({ to, ...data })
    } else if (type === 'approaching_turn') {
      result = await emailService.sendApproachingAlertEmail({ to, ...data })
    } else if (type === 'token_called') {
      result = await emailService.sendTokenCalledEmail({ to, ...data })
    } else if (type === 'procurement_completed') {
      result = await emailService.sendProcurementCompletedEmail({ to, ...data })
    } else if (type === 'payment_update') {
      result = await emailService.sendPaymentUpdateEmail({ to, ...data })
    } else {
      result = await emailService.sendMail({ to, subject: subject || 'QueueKisan Notification', html, text })
    }

    res.json({ success: true, result, recipient: to })
  } catch (error) {
    sendError(res, error)
  }
})

// ==========================================
// FARMER CHATBOT ENDPOINT
// ML + MULTILINGUAL RESPONSES
// ==========================================
app.post('/api/chatbot', async (req, res) => {
  try {
    const { message, farmerData } = req.body || {}

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required.'
      })
    }

    const userMessage = String(message).trim()

    // ------------------------------------------
    // 1. Ask ML service for intent + language
    // ------------------------------------------

    const mlResponse = await fetch(
      'http://127.0.0.1:8100/predict',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage
        })
      }
    )

    if (!mlResponse.ok) {
      throw new Error(
        `ML service returned ${mlResponse.status}`
      )
    }

    const mlData = await mlResponse.json()

    const intent = mlData.intent || 'OTHER'
    const language = mlData.language || 'en'

    console.log(
      `[Chatbot ML] intent=${intent}, language=${language}`
    )

    // ------------------------------------------
    // 2. Current farmer booking
    // ------------------------------------------

    const booking = farmerData || null

    // ------------------------------------------
    // 3. Select value for the detected intent
    // ------------------------------------------

    let value = null

    switch (intent) {

      case 'TOKEN_NUMBER':
        value = booking?.tokenNumber || '—'
        break

      case 'QUEUE_POSITION':
        value = booking?.queuePosition ?? 0
        break

      case 'WAITING_TIME':
        value = booking?.estimatedWait || '—'
        break

      case 'BOOKING_STATUS':
        value = booking?.status || '—'
        break

      case 'CENTRE_INFO':
        value = booking?.centre || '—'
        break

      case 'CROP_INFO':
        value = booking?.crop || '—'
        break

      case 'CURRENT_SERVING':
        value = booking?.currentServing || '—'
        break

      default:
        value = null
    }

    // ------------------------------------------
    // 4. Generate multilingual response
    // ------------------------------------------

    const reply = getChatbotResponse(
      intent,
      language,
      value,
      Boolean(booking)
    )

    // ------------------------------------------
    // 5. Return response
    // ------------------------------------------

    return res.json({
      success: true,
      reply,
      intent,
      language
    })

  } catch (error) {

    console.error(
      '[Chatbot] Error:',
      error
    )

    return res.status(500).json({
      success: false,
      error: 'Unable to process chatbot request.'
    })
  }
})

function titleCase(value = '') {
  return String(value)
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

app.use('/farmer', express.static(farmerAppDir))
app.get('/', (req, res) => {
  res.redirect('/farmer/login.html')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[QueueServer] listening on http://0.0.0.0:${PORT}`)
})
