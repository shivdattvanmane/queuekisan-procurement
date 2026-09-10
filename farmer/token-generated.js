document.addEventListener('DOMContentLoaded', async () => {
  await populateTicketData()
  setupModals()
  setupActions()

  document.getElementById('closeBtn').addEventListener('click', () => {
    window.location.href = 'index.html'
  })
})

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

async function populateTicketData() {
  const booking = await window.KrushiAPI.getActiveBooking()
  const bookingData = booking || {
    bookingId: '—', tokenNumber: '—', centre: '—', crop: '—',
    date: new Date().toISOString(), slot: '—',
  }

  if (bookingData.date) {
    bookingData.date = new Date(bookingData.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  document.getElementById('tgToken').textContent = bookingData.tokenNumber
  document.getElementById('tgBookingId').textContent = bookingData.bookingId
  document.getElementById('tgCrop').textContent = bookingData.crop
  document.getElementById('tgCentre').textContent = bookingData.centre
  document.getElementById('tgDate').textContent = bookingData.date
  document.getElementById('tgTimeSlot').textContent = bookingData.slot

  const userRaw = localStorage.getItem('krushi_user')
  const paymentRaw = localStorage.getItem('krushi_payment_profile')
  const parsedUser = userRaw ? JSON.parse(userRaw) : {}
  const parsedPayment = paymentRaw ? JSON.parse(paymentRaw) : {}

  document.getElementById('tgFarmerName').textContent = parsedUser.name || 'Farmer'

  const qrDataStr = window.QueueKisanQR.makePayload(bookingData, parsedUser, parsedPayment)
  window.QueueKisanQR.draw(document.getElementById('tgQrCanvas'), qrDataStr, 160)

  document.getElementById('qrModalCentreInfo').textContent = bookingData.centre
  document.getElementById('qrModalTokenInfo').textContent = bookingData.tokenNumber
  document.getElementById('qrModalTimeInfo').textContent = `${bookingData.date}, ${(bookingData.slot || '').split('-')[0].trim()}`
  window.QueueKisanQR.draw(document.getElementById('tgQrCanvasLarge'), qrDataStr, 280)

  try {
    const queueInfo = await window.KrushiAPI.getQueuePosition(booking)
    document.getElementById('tgPredictionSource').textContent = prettyPredictionSource(queueInfo.predictionSource || queueInfo.predictionModel)
    document.getElementById('tgLoadCluster').textContent = queueInfo.loadCluster || 'Unclassified'
    document.getElementById('tgPredictionWait').textContent = Number(queueInfo.estimatedWaitMinutes || 0) > 0 ? `~${Math.round(queueInfo.estimatedWaitMinutes)} min` : 'Now'
  } catch {
    document.getElementById('tgPredictionSource').textContent = 'Historical Heuristic'
    document.getElementById('tgLoadCluster').textContent = 'Unclassified'
    document.getElementById('tgPredictionWait').textContent = 'Now'
  }
}

function setupModals() {
  const qrModal = document.getElementById('qrModal')
  const cancelModal = document.getElementById('cancelModal')

  document.getElementById('viewQrFullBtn').addEventListener('click', () => qrModal.classList.add('visible'))
  document.getElementById('qrModalClose').addEventListener('click', () => qrModal.classList.remove('visible'))
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) qrModal.classList.remove('visible')
  })

  document.getElementById('cancelBookingBtn').addEventListener('click', () => cancelModal.classList.add('visible'))
  document.getElementById('abortCancelBtn').addEventListener('click', () => cancelModal.classList.remove('visible'))

  document.getElementById('confirmCancelBtn').addEventListener('click', async () => {
    try {
      const activeId = window.KrushiAPI.getActiveBookingId()
      if (activeId) {
        await window.KrushiAPI.cancelBooking(activeId)
      }
    } catch (e) {
      console.error('[TokenGenerated] Unable to cancel booking:', e)
    }
    alert('Booking cancelled successfully.')
    window.location.href = 'index.html'
  })
}

function setupActions() {
  document.getElementById('viewQueueBtn').addEventListener('click', () => {
    window.location.href = 'live-queue.html'
  })

  document.getElementById('saveQrBtn').addEventListener('click', async () => {
    const canvas = document.getElementById('tgQrCanvasLarge') || document.getElementById('tgQrCanvas')
    const bookingId = document.getElementById('tgBookingId').textContent || 'booking'
    const fileName = `queuekisan-${bookingId}.png`

    if (navigator.canShare && canvas?.toBlob) {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'QueueKisan Booking QR',
            text: 'Here is my QueueKisan procurement token.',
            files: [file],
          }).catch(console.error)
          return
        }
        downloadCanvas(canvas, fileName)
      }, 'image/png')
    } else if (navigator.share) {
      await navigator.share({
        title: 'QueueKisan Booking QR',
        text: 'Here is my QueueKisan procurement token.',
      }).catch(console.error)
    } else {
      downloadCanvas(canvas, fileName)
    }
  })
}

function downloadCanvas(canvas, fileName) {
  if (!canvas) return
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = fileName
  link.click()
}
