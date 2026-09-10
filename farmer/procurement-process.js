document.addEventListener('DOMContentLoaded', async () => {
  await renderState()

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'farmer-checkin.html'
  })

  document.getElementById('completeBtn').addEventListener('click', async () => {
    const active = await window.KrushiAPI.getActiveBooking()
    if (active?.procurementStatus === 'completed' || active?.queueStatus === 'completed') {
      window.location.href = 'procurement-completed.html'
      return
    }
    await renderState(true)
  })

  setInterval(async () => {
    const active = await window.KrushiAPI.getActiveBooking()
    if (active?.procurementStatus === 'completed' || active?.queueStatus === 'completed') {
      window.location.href = 'procurement-completed.html'
    }
  }, 8000)
})

async function renderState(showHint = false) {
  const booking = await readBookingData()
  document.getElementById('ppCrop').textContent = booking.crop
  document.getElementById('ppCentre').textContent = booking.centre
  document.getElementById('ppQuantity').textContent = booking.quantity
  document.getElementById('ppGrade').textContent = booking.grade

  const button = document.getElementById('completeBtn')
  if (booking.completed) {
    button.firstChild.textContent = 'View Completed Procurement '
  } else {
    button.firstChild.textContent = 'Refresh Procurement Status '
    if (showHint) alert('Procurement is still being processed. Please refresh again shortly.')
  }
}

async function readBookingData() {
  const active = await window.KrushiAPI.getActiveBooking()
  return {
    crop: active?.crop || '—',
    centre: active?.centre || '—',
    quantity: active?.quantityKg ? `${active.quantityKg} kg` : '—',
    grade: active?.quality || 'Grade A',
    completed: active?.procurementStatus === 'completed' || active?.queueStatus === 'completed',
  }
}
