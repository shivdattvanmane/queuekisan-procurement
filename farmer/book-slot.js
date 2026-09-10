/**
 * QueueKisan — Book Slot Logic
 */

let SLOTS_DATA = { Morning: [], Afternoon: [], Evening: [] };
let selectedDate = null;
let selectedSlotId = null;

function localIsoDate(date) {
  const normalized = new Date(date);
  normalized.setMinutes(normalized.getMinutes() - normalized.getTimezoneOffset());
  return normalized.toISOString().split('T')[0];
}

function periodForTime(timeStr) {
  const hourMatch = /(\d+):\d+\s*(AM|PM)/i.exec(timeStr || '');
  if (!hourMatch) return 'Morning';
  let hour = parseInt(hourMatch[1], 10);
  const isPM = /pm/i.test(hourMatch[2]);
  if (isPM && hour !== 12) hour += 12;
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function getDefaultSlots(dateStr) {
  return {
    Morning: [
      { id: `slot-m1-${dateStr}`, time: '09:00 AM - 10:00 AM', booked: 4, capacity: 25 },
      { id: `slot-m2-${dateStr}`, time: '10:00 AM - 11:00 AM', booked: 11, capacity: 25 },
      { id: `slot-m3-${dateStr}`, time: '11:00 AM - 12:00 PM', booked: 8, capacity: 25 },
    ],
    Afternoon: [
      { id: `slot-a1-${dateStr}`, time: '01:00 PM - 02:00 PM', booked: 5, capacity: 25 },
      { id: `slot-a2-${dateStr}`, time: '02:00 PM - 03:00 PM', booked: 2, capacity: 25, recommended: true },
      { id: `slot-a3-${dateStr}`, time: '03:00 PM - 04:00 PM', booked: 9, capacity: 25 },
    ],
    Evening: [
      { id: `slot-e1-${dateStr}`, time: '04:00 PM - 05:00 PM', booked: 6, capacity: 25 },
      { id: `slot-e2-${dateStr}`, time: '05:00 PM - 06:00 PM', booked: 3, capacity: 25 },
    ],
  };
}

async function loadSlotsForDate() {
  renderSlotSkeletons();
  SLOTS_DATA = { Morning: [], Afternoon: [], Evening: [] };
  
  try {
    const centre = JSON.parse(sessionStorage.getItem('booking_centre') || '{}');
    const crop = JSON.parse(sessionStorage.getItem('booking_crop') || '{}');
    
    if (centre.id && crop.id && selectedDate) {
      const rows = await window.KrushiAPI.getSlots(centre.id, crop.id, selectedDate);
      if (Array.isArray(rows) && rows.length > 0) {
        rows.forEach((slot, index) => {
          const period = periodForTime(slot.slot_time);
          SLOTS_DATA[period].push({
            id: slot.id,
            time: slot.slot_time,
            booked: Number(slot.booked_count || 0),
            capacity: Number(slot.capacity || 25),
            recommended: index === 1,
          });
        });
      }
    }
  } catch (e) {
    console.warn('[BookSlot] Using default slot schedule:', e);
  }

  // If no slots found from API, use default schedule
  const totalLoaded = Object.values(SLOTS_DATA).reduce((sum, list) => sum + list.length, 0);
  if (totalLoaded === 0) {
    SLOTS_DATA = getDefaultSlots(selectedDate || 'today');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSummaryData();
  renderDates();
  
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'select-centre.html';
  });

  document.getElementById('continueBtn').addEventListener('click', (e) => {
    if (e.currentTarget.classList.contains('disabled') || e.currentTarget.disabled) return;
    
    const slotObj = findSlotById(selectedSlotId);
    if (!slotObj) return;

    sessionStorage.setItem('booking_date', selectedDate);
    sessionStorage.setItem('booking_slot', JSON.stringify(slotObj));
    window.location.href = 'confirm-booking.html'; 
  });
});

function loadSummaryData() {
  const cropStr = sessionStorage.getItem('booking_crop');
  const centreStr = sessionStorage.getItem('booking_centre');

  if (cropStr) {
    try {
      const crop = JSON.parse(cropStr);
      document.getElementById('cropIcon').textContent = crop.icon || '🌾';
      document.getElementById('cropText').textContent = crop.name || 'Wheat';
    } catch {}
  }

  if (centreStr) {
    try {
      const centre = JSON.parse(centreStr);
      document.getElementById('centreText').textContent = centre.name || 'APMC Centre';
    } catch {}
  }
}

function renderDates() {
  const dateScroll = document.getElementById('dateScroll');
  if (!dateScroll) return;
  dateScroll.innerHTML = '';
  
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    
    const dayStr = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const num = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const dateValue = localIsoDate(d);
    
    if (i === 0) selectedDate = dateValue;

    const card = document.createElement('div');
    card.className = `bs-date-card ${i === 0 ? 'selected' : ''}`;
    card.innerHTML = `
      <span class="bs-date-day">${dayStr}</span>
      <span class="bs-date-num">${num}</span>
      <span class="bs-date-month">${month}</span>
    `;

    card.addEventListener('click', async () => {
      document.querySelectorAll('.bs-date-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedDate = dateValue;
      selectedSlotId = null;
      await loadSlotsForDate();
      renderSlots();
    });

    dateScroll.appendChild(card);
  }

  loadSlotsForDate().then(renderSlots);
}

function renderSlotSkeletons() {
  const container = document.getElementById('slotContainer');
  if (container) {
    container.innerHTML = `
      <div class="skeleton-card" style="height: 70px; margin-bottom: 10px; border-radius: 12px;"></div>
      <div class="skeleton-card" style="height: 70px; margin-bottom: 10px; border-radius: 12px;"></div>
      <div class="skeleton-card" style="height: 70px; border-radius: 12px;"></div>
    `;
  }
}

function renderSlots() {
  const container = document.getElementById('slotContainer');
  const suggestionBox = document.getElementById('smartSuggestion');
  if (!container) return;
  container.innerHTML = '';
  
  let hasRecommended = false;

  Object.keys(SLOTS_DATA).forEach(period => {
    const slots = SLOTS_DATA[period];
    if (!slots || slots.length === 0) return;
    
    const group = document.createElement('div');
    group.className = 'bs-slot-group';
    
    let icon = period === 'Morning' ? '🌅' : period === 'Afternoon' ? '☀️' : '🌆';
    group.innerHTML = `<div class="bs-slot-group-title">${icon} ${period}</div>`;
    
    const grid = document.createElement('div');
    grid.className = 'bs-slots-grid';

    slots.forEach(slot => {
      const isFull = slot.booked >= slot.capacity;
      const isSelected = selectedSlotId === slot.id;
      const available = Math.max(0, slot.capacity - slot.booked);
      
      const card = document.createElement('div');
      card.className = `bs-slot-card ${isFull ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`;
      
      card.innerHTML = `
        <span class="bs-slot-time">${slot.time}</span>
        <span class="bs-slot-avail">Available: ${available} / ${slot.capacity}</span>
      `;

      if (!isFull) {
        card.addEventListener('click', () => selectSlot(slot.id));
      }

      // Handle Recommendation UI
      if (slot.recommended && !isFull && !hasRecommended) {
        hasRecommended = true;
        const recTimeEl = document.getElementById('recSlotTime');
        if (recTimeEl) recTimeEl.textContent = slot.time;
        if (suggestionBox) suggestionBox.style.display = 'block';
        
        const recBtn = document.getElementById('selectRecBtn');
        if (recBtn) {
          const newBtn = recBtn.cloneNode(true);
          recBtn.parentNode.replaceChild(newBtn, recBtn);
          newBtn.addEventListener('click', () => {
            selectSlot(slot.id);
          });
        }
      }

      grid.appendChild(card);
    });

    group.appendChild(grid);
    container.appendChild(group);
  });

  if (!hasRecommended && suggestionBox) {
    suggestionBox.style.display = 'none';
  }

  updateBottomBar();
}

function selectSlot(id) {
  selectedSlotId = id;
  renderSlots();
}

function findSlotById(id) {
  for (const period of Object.values(SLOTS_DATA)) {
    const found = period.find(s => s.id === id);
    if (found) return found;
  }
  return null;
}

function updateBottomBar() {
  const btn = document.getElementById('continueBtn');
  const slotText = document.getElementById('selectedSlotText');
  if (!btn || !slotText) return;

  if (selectedSlotId) {
    const slotObj = findSlotById(selectedSlotId);
    slotText.textContent = slotObj ? slotObj.time : 'Selected';
    btn.classList.remove('disabled');
    btn.removeAttribute('disabled');
  } else {
    slotText.textContent = 'None selected';
    btn.classList.add('disabled');
    btn.setAttribute('disabled', 'disabled');
  }
}
