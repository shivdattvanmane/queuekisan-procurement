/* QueueKisan - Farmer Check-in Logic */

document.addEventListener('DOMContentLoaded', async () => {
  const booking = await readBookingData()

  document.getElementById('fcToken').textContent = booking.tokenNumber
  document.getElementById('fcCentre').textContent = booking.centre
  document.getElementById('fcCentreDetail').textContent = booking.centre
  document.getElementById('fcFarmer').textContent = booking.farmer
  document.getElementById('fcCrop').textContent = booking.crop
  document.getElementById('fcDate').textContent = booking.date
  document.getElementById('fcSlot').textContent = booking.slot
  const payload = window.QueueKisanQR.makePayload(booking)
  window.QueueKisanQR.draw(document.getElementById('fcQrCanvas'), payload, 200)

  if (booking.checkIn === 'checked-in') {
    showCheckedInState()
  }

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'token-called.html'
  })

  document.getElementById('checkinBtn').addEventListener('click', completeCheckin)
  document.getElementById('viewProcessBtn').addEventListener('click', () => {
    window.location.href = 'procurement-process.html'
  })
})

async function readBookingData() {
  const active = await window.KrushiAPI.getActiveBooking()
  const user = window.KrushiAPI.getCurrentUser()
  return {
    id: active?.id,
    tokenNumber: active?.tokenNumber || '—',
    farmer: user?.name || 'Farmer',
    crop: active?.crop || '—',
    centre: active?.centre || '—',
    date: active?.date ? new Date(active.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
    slot: active?.slot || '—',
    checkIn: active?.checkIn || 'pending',
  }
}

async function completeCheckin() {
  try {
    const activeId = window.KrushiAPI.getActiveBookingId()
    if (activeId) {
      await window.KrushiAPI.checkInBooking(activeId)
    }
    showCheckedInState()
  } catch (e) {
    console.error('[FarmerCheckin] Unable to update check-in status:', e)
    alert(e.message || 'Unable to complete check-in right now.')
  }
}

function showCheckedInState() {
  document.getElementById('fcStatus').textContent = 'Check-in Completed'
  document.getElementById('fcStatusRow').classList.add('completed')
  document.getElementById('checkinBtn').hidden = true
  document.getElementById('checkinIntro').hidden = true
  document.getElementById('successState').hidden = false
}

function drawQR(canvas, data) {
  if (!canvas) return

  const size = 200
  const cells = 15
  const cellSize = size / cells
  const context = canvas.getContext('2d')
  let seed = hashString(data)

  canvas.width = size
  canvas.height = size
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, size, size)
  context.fillStyle = '#1A1A1A'
  drawFinderPattern(context, 0, 0, cellSize)
  drawFinderPattern(context, (cells - 3) * cellSize, 0, cellSize)
  drawFinderPattern(context, 0, (cells - 3) * cellSize, cellSize)

  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const isFinder = (row < 3 && column < 3)
        || (row < 3 && column >= cells - 3)
        || (row >= cells - 3 && column < 3)
      if (isFinder) continue

      seed = (seed * 16807 + 12345) & 0x7fffffff
      if (seed % 2 !== 0) {
        context.fillRect(column * cellSize + 0.5, row * cellSize + 0.5, cellSize - 1, cellSize - 1)
      }
    }
  }
}

function drawFinderPattern(context, x, y, cellSize) {
  context.fillStyle = '#1A1A1A'
  context.fillRect(x, y, cellSize * 3, cellSize * 3)
  context.fillStyle = '#FFFFFF'
  context.fillRect(x + cellSize * 0.5, y + cellSize * 0.5, cellSize * 2, cellSize * 2)
  context.fillStyle = '#1A1A1A'
  context.fillRect(x + cellSize, y + cellSize, cellSize, cellSize)
}

function hashString(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) || 1
}
