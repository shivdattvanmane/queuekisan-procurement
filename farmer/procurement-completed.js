/* KrushiDarpan - Procurement Completed Logic */

document.addEventListener('DOMContentLoaded', async () => {
  const procurement = await readProcurementData();

  document.getElementById('pcCrop').textContent = procurement.crop;
  document.getElementById('pcQuantity').textContent = procurement.quantity;
  document.getElementById('pcGrade').textContent = procurement.grade;
  document.getElementById('pcCentre').textContent = procurement.centre;
  document.getElementById('pcDate').textContent = procurement.date;
  document.getElementById('pcAmount').textContent = procurement.amount;
  document.getElementById('pcId').textContent = procurement.id;

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'procurement-process.html';
  });

  document.getElementById('paymentBtn').addEventListener('click', () => {
    window.location.href = 'payment-processing.html';
  });
});

async function readProcurementData() {
  const active = await window.KrushiAPI.getActiveBooking();
  return {
    crop: active?.crop || '—',
    quantity: active?.quantityKg ? `${active.quantityKg} kg` : '—',
    grade: active?.quality || 'Grade A',
    centre: active?.centre || '—',
    date: active?.date ? new Date(active.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
    amount: active?.amount != null ? `₹${active.amount}` : 'Pending',
    id: active?.bookingId || '—',
  };
}
