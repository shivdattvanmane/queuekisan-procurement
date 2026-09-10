/**
 * QueueKisan — Live Queue Tracker
 * Realtime updates are delivered through the queue server Socket.IO channel.
 */

let queueState = {
  myToken: '—',
  servingToken: '—',
  farmersAhead: 0,
  estWaitMinutes: 0,
  predictedServiceMinutes: 0,
  predictionSource: 'historical-heuristic',
  predictionModel: 'historical-heuristic',
  loadCluster: 'Unclassified',
  status: 'waiting',
  centreName: '—',
  timeline: ['—'],
}

let allActiveBookings = []
let selectedTokenIndex = 0

async function loadQueueState() {
  allActiveBookings = await window.KrushiAPI.getActiveBookings()
  if (allActiveBookings.length > 0) {
    if (selectedTokenIndex >= allActiveBookings.length) selectedTokenIndex = 0
    currentBooking = allActiveBookings[selectedTokenIndex]
  } else {
    currentBooking = await window.KrushiAPI.getActiveBooking()
  }

  if (!currentBooking) {
    queueState = {
      myToken: '—',
      servingToken: '—',
      farmersAhead: 0,
      estWaitMinutes: 0,
      predictedServiceMinutes: 0,
      predictionSource: '—',
      predictionModel: '—',
      loadCluster: '—',
      status: 'waiting',
      centreName: 'No Active Booking',
      timeline: [],
    }
    return
  }

  const info = await window.KrushiAPI.getQueuePosition(currentBooking)
  queueState.myToken = currentBooking.tokenNumber || currentBooking.token || '—'
  queueState.centreName = currentBooking.centre || currentBooking.centreName || '—'
  queueState.servingToken = info.servingToken || '—'
  queueState.farmersAhead = Number(info.farmersAhead || 0)
  queueState.estWaitMinutes = Number(info.estimatedWaitMinutes || 0)
  queueState.timeline = info.timeline && info.timeline.length ? info.timeline : [queueState.myToken]
  queueState.predictedServiceMinutes = Number(info.predictedServiceMinutes || 0)
  queueState.predictionSource = info.predictionSource || '—'
  queueState.predictionModel = info.predictionModel || info.predictionSource || '—'
  queueState.loadCluster = info.loadCluster || 'Standard'

  if (currentBooking.status === 'Completed' || currentBooking.queueStatus === 'completed') queueState.status = 'completed'
  else if (currentBooking.status === 'Serving' || currentBooking.queueStatus === 'serving') queueState.status = 'serving'
  else if (info.servingToken === queueState.myToken) queueState.status = 'called'
  else if (queueState.farmersAhead <= 2) queueState.status = 'approaching'
  else queueState.status = 'waiting'
}

function renderMultiTokenSwitcher() {
  const bar = document.getElementById('lqMultiTokenBar')
  const container = document.getElementById('lqTokenChips')
  if (!bar || !container) return

  if (allActiveBookings.length > 1) {
    bar.style.display = 'block'
    container.innerHTML = ''
    allActiveBookings.forEach((b, idx) => {
      const chip = document.createElement('button')
      chip.className = `token-tab-chip ${idx === selectedTokenIndex ? 'active' : ''}`
      chip.type = 'button'
      chip.innerHTML = `<span>${b.tokenNumber}</span> <span style="opacity:0.8; font-size:11px;">(${b.crop})</span>`
      chip.addEventListener('click', async () => {
        selectedTokenIndex = idx
        currentBooking = allActiveBookings[idx]
        if (currentBooking?.id) window.KrushiAPI.setActiveBookingId(currentBooking.id)
        await loadQueueState()
        updateUI()
        await connectRealtime()
      })
      container.appendChild(chip)
    })
  } else {
    bar.style.display = 'none'
  }
}

async function connectRealtime() {
  const currentUser = window.KrushiAPI.getCurrentUser?.()
  const rooms = []
  if (currentUser?.userId) rooms.push(`user:${currentUser.userId}`)
  if (currentBooking?.id) rooms.push(`token:${currentBooking.id}`)
  if (currentBooking?.centreId) rooms.push(`centre:${currentBooking.centreId}`)
  if (!window.KrushiRealtime?.connect) return
  socketConnection = await window.KrushiRealtime.connect(rooms, async ({ event, payload }) => {
    if (!currentBooking) return
    const matchesBooking = payload?.bookingId && String(payload.bookingId) === String(currentBooking.id)
    const matchesUser = currentUser?.userId && payload?.userId && String(payload.userId) === String(currentUser.userId)
    if (!matchesBooking && !matchesUser && event !== 'queue:updated') return
    await loadQueueState()
    updateUI()
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadQueueState()

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html'
  })

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadQueueState()
    updateUI()
  })

  updateUI()
  await connectRealtime()
  setInterval(async () => {
    await loadQueueState()
    updateUI()
  }, 10000)
})

function updateUI() {
  document.getElementById('lqCentreName').textContent = queueState.centreName
  document.getElementById('lqMyToken').textContent = queueState.myToken
  document.getElementById('lqServingToken').textContent = queueState.servingToken
  document.getElementById('lqFarmersAhead').textContent = queueState.farmersAhead

  if (queueState.farmersAhead === 0 && queueState.status !== 'serving' && queueState.status !== 'completed') {
    document.getElementById('lqEstTime').textContent = 'Now'
  } else if (queueState.status === 'completed') {
    document.getElementById('lqEstTime').textContent = '-'
  } else {
    document.getElementById('lqEstTime').textContent = `~${Math.round(queueState.estWaitMinutes)} min`
  }

  renderMultiTokenSwitcher()
  updateStatusBanner()
  updateSmartAlert()
  renderPredictionInsights()
  renderTimeline()
}

function updateStatusBanner() {
  const banner = document.getElementById('lqStatusBanner')
  const text = document.getElementById('lqStatusText')

  banner.className = 'lq-status-banner'

  switch (queueState.status) {
    case 'waiting':
      banner.classList.add('state-waiting')
      text.textContent = 'Waiting in Queue'
      break
    case 'approaching':
      banner.classList.add('state-approaching')
      text.textContent = 'Approaching Soon'
      break
    case 'called':
      banner.classList.add('state-called')
      text.textContent = 'Your Token is Called!'
      break
    case 'serving':
      banner.classList.add('state-serving')
      text.textContent = 'Currently at Counter'
      break
    case 'completed':
      banner.classList.add('state-completed')
      text.textContent = 'Procurement Completed'
      break
  }
}

function prettyPredictionSource(source = '') {
  const map = {
    'ml-hybrid': 'Hybrid ML',
    'ml-cluster': 'Cluster ML',
    'fallback': 'Fallback',
    'historical-heuristic': 'Historical Heuristic',
    'hybrid_ml': 'Hybrid ML',
    'cluster_ml': 'Cluster ML',
  }
  return map[source] || String(source || 'historical-heuristic').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function renderPredictionInsights() {
  const sourceEl = document.getElementById('lqPredictionSource')
  const clusterEl = document.getElementById('lqLoadCluster')
  const serviceEl = document.getElementById('lqServiceMinutes')
  const noteEl = document.getElementById('lqPredictionNote')

  sourceEl.textContent = prettyPredictionSource(queueState.predictionSource)
  clusterEl.textContent = queueState.loadCluster || 'Unclassified'
  serviceEl.textContent = queueState.predictedServiceMinutes > 0 ? `~${Math.round(queueState.predictedServiceMinutes)} min` : 'Calibrating'

  if (queueState.predictionSource === 'ml-hybrid' || queueState.predictionModel === 'hybrid_ml') {
    noteEl.textContent = 'ETA uses live queue load clusters plus learned service-duration patterns from completed procurements.'
  } else if (queueState.predictionSource === 'ml-cluster' || queueState.predictionModel === 'cluster_ml') {
    noteEl.textContent = 'ETA uses a real queue-load clustering model. Regression will activate automatically as more completed lifecycle samples are recorded.'
  } else {
    noteEl.textContent = 'ETA is currently using historical queue heuristics until enough recorded lifecycle samples are available.'
  }
}

function updateSmartAlert() {
  const alertBox = document.getElementById('lqSmartAlert')
  const title = document.getElementById('lqAlertTitle')
  const msg = document.getElementById('lqAlertMsg')

  if (queueState.status === 'completed' || queueState.status === 'serving') {
    alertBox.style.display = 'none'
    return
  }

  alertBox.style.display = 'flex'

  if (queueState.status === 'called') {
    alertBox.style.backgroundColor = '#E0F4E0'
    alertBox.style.borderColor = '#207A40'
    title.textContent = 'Proceed to Counter!'
    title.style.color = '#104020'
    msg.textContent = 'Please show your QR code to the officer at the weighbridge immediately.'
  } else if (queueState.farmersAhead <= 2) {
    alertBox.style.backgroundColor = '#FFF3DC'
    alertBox.style.borderColor = '#B8860B'
    title.textContent = 'Get Ready!'
    title.style.color = '#B8860B'
    msg.textContent = 'Only a few farmers are ahead. Please gather your documents and move towards the unloading zone.'
  } else {
    alertBox.style.backgroundColor = '#FAFCFA'
    alertBox.style.borderColor = '#E0F0E0'
    title.textContent = 'You have time!'
    title.style.color = '#104020'
    msg.textContent = 'We will notify you when your turn gets closer.'
  }
}

function renderTimeline() {
  const nodesContainer = document.getElementById('timelineNodes')
  nodesContainer.innerHTML = ''

  const timeline = queueState.timeline
  if (!timeline || timeline.length === 0) return

  const servingIndex = timeline.indexOf(queueState.servingToken)
  const track = document.querySelector('.lq-timeline-track')
  const progressPercent = servingIndex >= 0 && timeline.length > 1 ? (servingIndex / (timeline.length - 1)) * 100 : 0
  track.style.setProperty('--progress-width', `${progressPercent}%`)

  timeline.forEach((token, index) => {
    const isCompleted = index < servingIndex
    const isServing = index === servingIndex
    const isMyToken = token === queueState.myToken

    const node = document.createElement('div')
    node.className = `lq-node ${isCompleted ? 'completed' : ''} ${isServing ? 'serving' : ''} ${isMyToken ? 'my-token' : ''}`

    let iconHtml = ''
    if (isCompleted) {
      iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    } else if (isServing && isMyToken) {
      iconHtml = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
    }

    node.innerHTML = `
      <div class="lq-node-circle">${iconHtml}</div>
      <span class="lq-node-token">${token === queueState.myToken ? 'You' : token}</span>
    `

    nodesContainer.appendChild(node)
  })
}
