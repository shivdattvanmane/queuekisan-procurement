/**
 * QueueKisan — Review & Confirm Booking Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadBookingSummary();
  await guardAgainstExistingActiveBooking();

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'book-slot.html';
  });

  document.getElementById('bookTokenBtn').addEventListener('click', handleBooking);
  
  // Clear error styling on input
  document.getElementById('estQuantity').addEventListener('input', (e) => {
    e.target.parentElement.classList.remove('error');
  });
});

async function guardAgainstExistingActiveBooking() {
  try {
    const activeList = await window.KrushiAPI.getActiveBookings();
    if (activeList && activeList.length > 0) {
      const infoEl = document.getElementById('cbMultiBookingInfo');
      if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.textContent = `You have ${activeList.length} other active booking(s). This will add an additional slot token.`;
      }
    }
  } catch (error) {
    console.warn('[ConfirmBooking] Active bookings check:', error);
  }
}

function loadBookingSummary() {
  // Load Farmer Name
  const userData = localStorage.getItem('krushi_user');
  if (userData) {
    try {
      const user = JSON.parse(userData);
      document.getElementById('cbFarmerName').textContent = user.name || 'Farmer';
    } catch {}
  } else {
    document.getElementById('cbFarmerName').textContent = 'Farmer';
  }

  // Load Centre
  const centreStr = sessionStorage.getItem('booking_centre');
  if (centreStr) {
    try {
      const centre = JSON.parse(centreStr);
      document.getElementById('cbCentreName').textContent = centre.name || 'APMC Centre';
      document.getElementById('cbCentreLoc').textContent = centre.location || 'Maharashtra';
    } catch {}
  } else {
    document.getElementById('cbCentreName').textContent = 'Pune APMC Market Yard';
    document.getElementById('cbCentreLoc').textContent = 'Gultekdi, Pune';
  }

  // Load Crop
  const cropStr = sessionStorage.getItem('booking_crop');
  if (cropStr) {
    try {
      const crop = JSON.parse(cropStr);
      document.getElementById('cbCropIcon').textContent = crop.icon || '🌾';
      document.getElementById('cbCropName').textContent = crop.name || 'Wheat';
    } catch {}
  } else {
    document.getElementById('cbCropIcon').textContent = '🌾';
    document.getElementById('cbCropName').textContent = 'Wheat';
  }

  // Load Date & Slot
  const dateStr = sessionStorage.getItem('booking_date');
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
      document.getElementById('cbDate').textContent = isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', options);
    } catch {
      document.getElementById('cbDate').textContent = dateStr;
    }
  } else {
    document.getElementById('cbDate').textContent = 'Today';
  }

  const slotStr = sessionStorage.getItem('booking_slot');
  if (slotStr) {
    try {
      const slot = JSON.parse(slotStr);
      document.getElementById('cbTimeSlot').textContent = slot.time || '10:00 AM - 11:00 AM';
    } catch {}
  } else {
    document.getElementById('cbTimeSlot').textContent = '10:00 AM - 11:00 AM';
  }
}

async function handleBooking(e) {
  const btn = e.currentTarget;
  if (btn.classList.contains('disabled') || btn.disabled) return;

  const quantityInput = document.getElementById('estQuantity');
  const quantity = Number(quantityInput.value.trim());

  // Validate Quantity
  if (!quantity || quantity <= 0) {
    quantityInput.parentElement.classList.add('error');
    quantityInput.focus();
    showToast('Please enter a valid estimated quantity in kg.');
    return;
  }

  // Set loading state
  btn.classList.add('disabled');
  btn.disabled = true;
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  if (btnText) btnText.style.display = 'none';
  if (btnLoader) btnLoader.style.display = 'inline-block';

  try {
    const centre = JSON.parse(sessionStorage.getItem('booking_centre') || '{"id":"cntr-pune-apmc","name":"Pune APMC"}');
    const crop = JSON.parse(sessionStorage.getItem('booking_crop') || '{"id":"crop-wheat","name":"Wheat"}');
    const slot = JSON.parse(sessionStorage.getItem('booking_slot') || '{"id":"slot-1","time":"10:00 AM - 11:00 AM"}');
    const slotDate = sessionStorage.getItem('booking_date') || new Date().toISOString().slice(0, 10);

    const result = await window.KrushiAPI.createBooking({
      centreId: centre.id || 'cntr-pune-apmc',
      cropId: crop.id || 'crop-wheat',
      slotId: slot.id || 'slot-1',
      slotDate,
      slotTime: slot.time || '10:00 AM - 11:00 AM',
      quantityKg: quantity,
    });

    // Show Success Overlay
    const overlay = document.getElementById('successOverlay');
    if (overlay) overlay.style.display = 'flex';
    
    // Clear session storage as the booking is complete
    sessionStorage.removeItem('booking_centre');
    sessionStorage.removeItem('booking_crop');
    sessionStorage.removeItem('booking_date');
    sessionStorage.removeItem('booking_slot');

    // Smooth redirect to Token Generated screen
    setTimeout(() => {
      window.location.href = 'token-generated.html';
    }, 1200);

  } catch (error) {
    console.error('[ConfirmBooking] Error creating booking:', error);
    showToast(error?.message || 'An error occurred while booking. Please try again.');
    btn.classList.remove('disabled');
    btn.disabled = false;
    if (btnText) btnText.style.display = 'block';
    if (btnLoader) btnLoader.style.display = 'none';
  }
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
