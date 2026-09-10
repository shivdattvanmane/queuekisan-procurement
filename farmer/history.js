/* KrushiDarpan - History Logic */

let bookingHistory = [];
let procurementHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
  renderHistorySkeletons();
  await loadHistory();
  renderBookingHistory();
  renderProcurementHistory();

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});

function renderHistorySkeletons() {
  const bookingList = document.getElementById('bookingList');
  const procurementList = document.getElementById('procurementList');
  if (bookingList) {
    bookingList.innerHTML = `
      <div class="skeleton-card" style="margin-bottom:12px;">
        <div class="skeleton skeleton-title" style="width:50%;"></div>
        <div class="skeleton skeleton-text" style="width:80%;"></div>
        <div class="skeleton skeleton-text" style="width:65%;"></div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton skeleton-title" style="width:40%;"></div>
        <div class="skeleton skeleton-text" style="width:75%;"></div>
        <div class="skeleton skeleton-text" style="width:60%;"></div>
      </div>
    `;
  }
  if (procurementList) {
    procurementList.innerHTML = `
      <div class="skeleton-card">
        <div class="skeleton skeleton-title" style="width:45%;"></div>
        <div class="skeleton skeleton-text" style="width:70%;"></div>
      </div>
    `;
  }
}

async function loadHistory() {
  let rows = [];
  try {
    rows = await window.KrushiAPI.getBookingHistory();
  } catch (e) {
    console.error('[History] Unable to load booking history:', e);
  }

  bookingHistory = rows.map((b) => ({
    centre: b.centre,
    crop: b.crop,
    date: b.date ? new Date(b.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
    slot: b.slot,
    token: b.tokenNumber,
    status: b.status === 'Completed' ? 'Completed' : ['skipped', 'cancelled'].includes(b.queueStatus) ? 'Cancelled' : 'Upcoming',
  }));

  procurementHistory = rows
    .filter((b) => b.procurementStatus === 'completed')
    .map((b) => ({
      crop: b.crop,
      quantity: b.quantityKg ? `${b.quantityKg} kg` : '—',
      centre: b.centre,
      date: b.date ? new Date(b.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
      amount: b.amount != null ? `₹${b.amount}` : '—',
      procurementStatus: 'Completed',
      paymentStatus: b.paymentStatus === 'completed' ? 'Completed' : 'Pending',
    }));
}

function renderBookingHistory() {
  const list = document.getElementById('bookingList');
  const empty = document.getElementById('bookingEmpty');
  list.innerHTML = '';

  if (bookingHistory.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  bookingHistory.forEach(record => {
    const card = document.createElement('article');
    card.className = 'history-record';
    card.innerHTML = `
      <div class="history-record-top">
        <div class="history-record-title">
          <strong>${record.centre}</strong>
          <span>${record.crop}</span>
        </div>
        ${statusBadge(record.status)}
      </div>
      <div class="history-record-grid">
        <div><span>Date</span><strong>${record.date}</strong></div>
        <div><span>Slot</span><strong>${record.slot}</strong></div>
        <div><span>Token</span><strong>${record.token}</strong></div>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderProcurementHistory() {
  const list = document.getElementById('procurementList');
  const empty = document.getElementById('procurementEmpty');
  list.innerHTML = '';

  if (procurementHistory.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  procurementHistory.forEach(record => {
    const card = document.createElement('article');
    card.className = 'history-record';
    card.innerHTML = `
      <div class="history-record-top">
        <div class="history-record-title">
          <strong>${record.crop}</strong>
          <span>${record.centre}</span>
        </div>
        ${statusBadge(record.procurementStatus)}
      </div>
      <div class="history-record-grid">
        <div><span>Quantity</span><strong>${record.quantity}</strong></div>
        <div><span>Date</span><strong>${record.date}</strong></div>
        <div><span>Procurement status</span><strong>${record.procurementStatus}</strong></div>
      </div>
      <div class="history-payment-row">
        <span class="history-payment-label">Payment status</span>
        <span class="history-payment-status">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          ${record.paymentStatus}
        </span>
        <strong class="history-amount">${record.amount}</strong>
      </div>
    `;
    list.appendChild(card);
  });
}

function statusBadge(status) {
  const className = `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
  const icon = status === 'Completed'
    ? '<polyline points="20 6 9 17 4 12"/>'
    : status === 'Upcoming'
      ? '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>'
      : '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>';

  return `<span class="history-status ${className}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>${status}</span>`;
}
