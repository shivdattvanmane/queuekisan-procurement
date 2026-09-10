/* KrushiDarpan - Payment Completed Logic */

document.addEventListener('DOMContentLoaded', async () => {
  const payment = await readPaymentData();

  document.getElementById('paidAmount').textContent = payment.amount;
  document.getElementById('paidReference').textContent = payment.reference;
  document.getElementById('paidDate').textContent = payment.date;
  document.getElementById('paidCrop').textContent = payment.crop;
  document.getElementById('paidCentre').textContent = payment.centre;

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'payment-processing.html';
  });
});

async function readPaymentData() {
  const active = await window.KrushiAPI.getActiveBooking();
  return {
    amount: active?.amount != null ? `₹${active.amount}` : '—',
    reference: active?.referenceId || '—',
    date: active?.paymentDate ? new Date(active.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
    crop: active?.crop || '—',
    centre: active?.centre || '—',
  };
}
