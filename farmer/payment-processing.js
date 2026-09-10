document.addEventListener('DOMContentLoaded', async () => {
  await renderPaymentState()

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'procurement-completed.html'
  })

  const primaryBtn = document.getElementById('completePaymentBtn')
  const failBtn = document.getElementById('failPaymentBtn')
  const retryBtn = document.getElementById('retryPaymentBtn')
  if (failBtn) failBtn.hidden = true
  if (retryBtn) retryBtn.hidden = true
  primaryBtn.firstChild.textContent = 'Refresh Payment Status '

  primaryBtn.addEventListener('click', async () => {
    const payment = await renderPaymentState(true)
    if (payment.status === 'completed') {
      window.location.href = 'payment-completed.html'
    }
  })

  setInterval(async () => {
    const active = await window.KrushiAPI.getActiveBooking()
    if (active?.paymentStatus === 'completed') {
      window.location.href = 'payment-completed.html'
    }
  }, 8000)
})

async function renderPaymentState(showHint = false) {
  const payment = await readPaymentData()
  document.getElementById('payAmount').textContent = payment.amount
  document.getElementById('payCentre').textContent = payment.centre
  document.getElementById('payReference').textContent = payment.reference
  document.getElementById('payDate').textContent = payment.date
  document.getElementById('payStatus').textContent = payment.bannerText

  const banner = document.querySelector('.pay-status-banner')
  const infoTitle = document.querySelector('.pay-info-card strong')
  const infoText = document.querySelector('.pay-info-card p')
  banner.classList.remove('pay-failed')

  if (payment.status === 'completed') {
    infoTitle.textContent = 'Payment completed'
    infoText.textContent = 'Your payment has been settled successfully.'
  } else if (payment.status === 'failed') {
    banner.classList.add('pay-failed')
    infoTitle.textContent = 'Payment needs attention'
    infoText.textContent = 'Please contact the procurement centre for an update.'
  } else {
    infoTitle.textContent = 'Nothing more is needed from you'
    infoText.textContent = 'We will update your payment status here when processing is complete.'
    if (showHint) alert('Payment is still being processed. Please refresh again shortly.')
  }

  return payment
}

async function readPaymentData() {
  const active = await window.KrushiAPI.getActiveBooking()
  const status = active?.paymentStatus || 'pending'
  return {
    status,
    bannerText: status === 'completed' ? 'Payment Completed' : status === 'failed' ? 'Payment Needs Attention' : 'Payment Processing',
    amount: active?.amount != null ? `₹${active.amount}` : 'Pending',
    centre: active?.centre || '—',
    reference: active?.referenceId || 'Pending',
    date: active?.paymentDate ? new Date(active.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'To be updated',
  }
}
