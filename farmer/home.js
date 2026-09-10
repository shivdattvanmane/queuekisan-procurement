/**
 * KrushiDarpan — Home Dashboard Logic
 *
 * Handles:
 *  - Dynamic greeting based on time of day
 *  - Farmer name from auth session
 *  - Booking state toggling (skeleton -> active / multi-booking / no-booking)
 *  - Multi-booking switching
 *  - QR code generation on canvas
 *  - QR modal open/close
 *  - Notification prompt interaction
 *  - Farmer chatbot
 */

let activeBookings = [];
let selectedBookingIndex = 0;
let isLoadingHome = true;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  setGreeting();
  setFarmerName();
  setupQRModal();
  setupNotification();
  setupNavigation();
  setupChatbot();

  await loadHomeBookings();
  await updateNotificationBadge();
  renderBookingState();

  setInterval(async () => {
    await loadHomeBookings();
    await updateNotificationBadge();
    renderBookingState();
  }, 8000);
});

// ============================================================
// NOTIFICATION BADGE
// ============================================================
async function updateNotificationBadge() {
  try {
    const list = await window.KrushiAPI.getNotifications();
    const unreadCount = list.filter((n) => !n.read).length;
    const dot = document.querySelector('.notif-dot');

    if (dot) {
      dot.style.display = unreadCount > 0 ? 'block' : 'none';
    }
  } catch (e) {
    console.error('[Home] Unable to update notification badge:', e);
  }
}

// ============================================================
// LOAD HOME BOOKINGS
// ============================================================
async function loadHomeBookings() {
  try {
    const bookings = await window.KrushiAPI.getActiveBookings();

    if (Array.isArray(bookings) && bookings.length > 0) {
      const enriched = await Promise.all(
        bookings.map(async (b) => {
          try {
            const queueInfo = await window.KrushiAPI.getQueuePosition(b);

            return {
              exists: true,
              tokenNumber: b.tokenNumber || b.token || '—',
              bookingId: b.bookingId || b.id || '—',
              centre: b.centre || b.centreName || '—',
              crop: b.crop || 'Crop',
              date: b.date || '—',
              slot: b.slot || '—',
              status: b.status || 'Waiting',
              queueStatus: b.queueStatus,
              queuePosition: queueInfo.farmersAhead ?? 0,
              estimatedWait:
                queueInfo.farmersAhead === 0
                  ? 'Now'
                  : `~${Math.round(
                      Number(
                        queueInfo.estimatedWaitMinutes ||
                        queueInfo.farmersAhead * 10
                      )
                    )} min`,
              currentServing: queueInfo.servingToken || '—',
            };
          } catch {
            return {
              exists: true,
              tokenNumber: b.tokenNumber || b.token || '—',
              bookingId: b.bookingId || b.id || '—',
              centre: b.centre || b.centreName || '—',
              crop: b.crop || 'Crop',
              date: b.date || '—',
              slot: b.slot || '—',
              status: b.status || 'Waiting',
              queueStatus: b.queueStatus,
              queuePosition: 0,
              estimatedWait: '—',
              currentServing: '—',
            };
          }
        })
      );

      activeBookings = enriched;

      if (selectedBookingIndex >= activeBookings.length) {
        selectedBookingIndex = 0;
      }
    } else {
      activeBookings = [];
    }
  } catch (e) {
    console.error('[Home] Unable to load active bookings:', e);
    activeBookings = [];
  } finally {
    isLoadingHome = false;
  }
}

// ============================================================
// GREETING
// ============================================================
function setGreeting() {
  const hour = new Date().getHours();

  let key = 'home.goodMorning';
  let defaultGreeting = 'Good Morning';

  if (hour >= 12 && hour < 17) {
    key = 'home.goodAfternoon';
    defaultGreeting = 'Good Afternoon';
  } else if (hour >= 17 && hour < 21) {
    key = 'home.goodEvening';
    defaultGreeting = 'Good Evening';
  } else if (hour >= 21) {
    key = 'home.goodNight';
    defaultGreeting = 'Good Night';
  }

  const el = document.getElementById('greetingTime');

  if (el) {
    el.textContent =
      (window.t ? window.t(key, defaultGreeting) : defaultGreeting) + ',';
  }
}

window.addEventListener('languageChanged', () => {
  setGreeting();
  renderBookingState();

  if (window.LanguageManager) {
    window.LanguageManager.applyTranslations();
  }
});

// ============================================================
// FARMER NAME
// ============================================================
function setFarmerName() {
  const nameEl = document.getElementById('farmerName');

  if (!nameEl) return;

  try {
    const userData = localStorage.getItem('krushi_user');

    if (userData) {
      const user = JSON.parse(userData);
      const firstName = user.name
        ? user.name.split(' ')[0]
        : 'Farmer';

      nameEl.textContent = firstName + '!';
      return;
    }
  } catch (e) {
    // fallback
  }

  nameEl.textContent = 'Farmer!';
}

// ============================================================
// BOOKING STATE
// ============================================================
function renderBookingState() {
  const skeletonCard = document.getElementById('bookingCardSkeleton');
  const activeCard = document.getElementById('activeBookingCard');
  const noBookingCard = document.getElementById('noBookingCard');

  if (isLoadingHome) {
    if (skeletonCard) skeletonCard.style.display = 'flex';
    if (activeCard) activeCard.style.display = 'none';
    if (noBookingCard) noBookingCard.style.display = 'none';
    return;
  }

  if (skeletonCard) skeletonCard.style.display = 'none';

  if (activeBookings.length > 0) {
    if (activeCard) activeCard.style.display = 'block';
    if (noBookingCard) noBookingCard.style.display = 'none';

    renderMultiTokenTabs();

    populateBookingCard(
      activeBookings[selectedBookingIndex] ||
      activeBookings[0]
    );

    const current =
      activeBookings[selectedBookingIndex] ||
      activeBookings[0];

    if (window.QueueKisanQR && current) {
      const payload = window.QueueKisanQR.makePayload(current);

      window.QueueKisanQR.draw(
        document.getElementById('qrCanvas'),
        payload,
        64
      );

      if (current.bookingId) {
        window.KrushiAPI.setActiveBookingId(
          current.bookingId
        );
      }
    }
  } else {
    if (activeCard) activeCard.style.display = 'none';
    if (noBookingCard) noBookingCard.style.display = 'block';
  }
}

// ============================================================
// MULTI BOOKING TABS
// ============================================================
function renderMultiTokenTabs() {
  const bar = document.getElementById('multiTokenBar');
  const chipsContainer =
    document.getElementById('multiTokenChips');
  const title =
    document.getElementById('multiTokenTitle');

  if (!bar || !chipsContainer) return;

  if (activeBookings.length > 1) {
    bar.style.display = 'block';

    if (title) {
      title.textContent =
        `Active Bookings (${activeBookings.length})`;
    }

    chipsContainer.innerHTML = '';

    activeBookings.forEach((b, idx) => {
      const chip = document.createElement('button');

      chip.className =
        `token-tab-chip ${
          idx === selectedBookingIndex ? 'active' : ''
        }`;

      chip.type = 'button';

      chip.innerHTML =
        `<span>${b.tokenNumber}</span> ` +
        `<span style="opacity:0.8; font-size:11px;">` +
        `(${b.crop})</span>`;

      chip.addEventListener('click', () => {
        selectedBookingIndex = idx;
        renderBookingState();
      });

      chipsContainer.appendChild(chip);
    });
  } else {
    bar.style.display = 'none';
  }
}

// ============================================================
// POPULATE BOOKING CARD
// ============================================================
function populateBookingCard(booking) {
  if (!booking) return;

  setText('tokenNumber', booking.tokenNumber);
  setText('bookingCentre', booking.centre);
  setText('bookingCrop', booking.crop);
  setText('bookingDate', booking.date);
  setText('bookingSlot', booking.slot);
  setText('queuePosition', booking.queuePosition ?? '—');
  setText('estWait', booking.estimatedWait || '—');
  setText(
    'currentServing',
    booking.currentServing || '—'
  );

  const badge =
    document.getElementById('tokenStatusBadge');

  if (badge) {
    const rawStatus = booking.status || 'Waiting';

    const statusKey =
      'status.' + rawStatus.toLowerCase();

    badge.textContent =
      window.t
        ? window.t(statusKey, rawStatus)
        : rawStatus;

    badge.className = 'token-status-badge';

    const statusColors = {
      Waiting: 'rgba(255,255,255,0.2)',
      Approaching: 'rgba(217,164,65,0.3)',
      Called: 'rgba(255,107,107,0.3)',
      Serving: 'rgba(58,154,85,0.4)',
    };

    badge.style.backgroundColor =
      statusColors[rawStatus] ||
      statusColors.Waiting;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.textContent = value;
  }
}

// ============================================================
// QR MODAL
// ============================================================
function setupQRModal() {
  const qrButton =
    document.getElementById('qrButton');

  const modal =
    document.getElementById('qrModal');

  const closeBtn =
    document.getElementById('qrModalClose');

  if (!qrButton || !modal) return;

  qrButton.addEventListener('click', () => {
    const current =
      activeBookings[selectedBookingIndex] ||
      activeBookings[0];

    if (!current) return;

    const payload =
      window.QueueKisanQR.makePayload(current);

    window.QueueKisanQR.draw(
      document.getElementById('qrModalCanvas'),
      payload,
      200
    );

    setText(
      'qrModalToken',
      current.tokenNumber
    );

    setText(
      'qrModalCentre',
      current.centre
    );

    modal.classList.add('visible');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('visible');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible');
    }
  });
}

// ============================================================
// NOTIFICATION PROMPT
// ============================================================
function setupNotification() {
  const enableBtn =
    document.getElementById('enableNotifBtn');

  const prompt =
    document.getElementById('notifPrompt');

  if (!enableBtn || !prompt) return;

  enableBtn.addEventListener('click', () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          showHomeToast(
            'Notifications enabled! 🔔',
            'success'
          );

          prompt.style.display = 'none';
        } else {
          showHomeToast(
            'Please enable notifications in settings.',
            'info'
          );
        }
      });
    } else {
      showHomeToast(
        'Notifications enabled! 🔔',
        'success'
      );

      prompt.style.display = 'none';
    }
  });
}

// ============================================================
// NAVIGATION
// ============================================================
function setupNavigation() {
  const routes = {
    notifBtn: 'notifications.html',
    profileBtn: 'profile.html',
    ctaBookSlot: 'select-crop.html',
    qaBookSlot: 'select-crop.html',
    qaViewToken: 'token-generated.html',
    qaTrackQueue: 'live-queue.html',
    qaProcurement: 'procurement-process.html',
    btnBookAnother: 'select-crop.html',
  };

  Object.entries(routes).forEach(([id, route]) => {
    const element =
      document.getElementById(id);

    if (element) {
      element.addEventListener('click', () => {
        window.location.href = route;
      });
    }
  });
}

// ============================================================
// TOAST
// ============================================================
function showHomeToast(
  message,
  type = 'success'
) {
  const existing =
    document.querySelector('.home-toast');

  if (existing) existing.remove();

  const toast =
    document.createElement('div');

  toast.className = 'home-toast';

  toast.textContent = message;

  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: ${
      type === 'success'
        ? '#207A40'
        : '#104020'
    };
    color: #fff;
    padding: 12px 24px;
    border-radius: 12px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    z-index: 300;
    opacity: 0;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';

    toast.style.transform =
      'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';

    toast.style.transform =
      'translateX(-50%) translateY(20px)';

    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

// ============================================================
// FARMER CHATBOT
// ============================================================

function setupChatbot() {

  const chatbotFab =
    document.getElementById('chatbotFab');

  const chatbotPopup =
    document.getElementById('chatbotPopup');

  const chatbotClose =
    document.getElementById('chatbotClose');

  const chatbotInput =
    document.getElementById('chatbotInput');

  const chatbotSend =
    document.getElementById('chatbotSend');

  const chatbotMessages =
    document.getElementById('chatbotMessages');

  // ----------------------------------------------------------
  // Check chatbot HTML
  // ----------------------------------------------------------

  if (!chatbotFab) {
    console.error('[Chatbot] chatbotFab not found');
    return;
  }

  if (!chatbotPopup) {
    console.error('[Chatbot] chatbotPopup not found');
    return;
  }

  if (!chatbotInput) {
    console.error('[Chatbot] chatbotInput not found');
    return;
  }

  if (!chatbotSend) {
    console.error('[Chatbot] chatbotSend not found');
    return;
  }

  if (!chatbotMessages) {
    console.error('[Chatbot] chatbotMessages not found');
    return;
  }

  // ----------------------------------------------------------
  // Open chatbot
  // ----------------------------------------------------------

  chatbotFab.addEventListener('click', () => {
    chatbotPopup.style.display = 'flex';
    chatbotFab.style.display = 'none';

    setTimeout(() => {
      chatbotInput.focus();
    }, 100);
  });

  // ----------------------------------------------------------
  // Close chatbot
  // ----------------------------------------------------------

  if (chatbotClose) {
    chatbotClose.addEventListener('click', () => {
      chatbotPopup.style.display = 'none';
      chatbotFab.style.display = 'flex';
    });
  }

  // ----------------------------------------------------------
  // Send chatbot message
  // ----------------------------------------------------------

  async function sendChatMessage() {

    const message =
      chatbotInput.value.trim();

    // Don't send empty message
    if (!message) {
      return;
    }

    // --------------------------------------------------------
    // User message
    // --------------------------------------------------------

    const userMessage =
      document.createElement('div');

    userMessage.className =
      'chatbot-message user-message';

    const userBubble =
      document.createElement('div');

    userBubble.className =
      'message-bubble';

    const userText =
      document.createElement('p');

    // Use textContent instead of innerHTML
    userText.textContent = message;

    userBubble.appendChild(userText);
    userMessage.appendChild(userBubble);

    chatbotMessages.appendChild(userMessage);

    // Clear input
    chatbotInput.value = '';

    chatbotMessages.scrollTop =
      chatbotMessages.scrollHeight;

    // --------------------------------------------------------
    // Bot thinking message
    // --------------------------------------------------------

    const botMessage =
      document.createElement('div');

    botMessage.className =
      'chatbot-message bot-message';

    botMessage.innerHTML = `
      <div class="message-avatar">🌾</div>
      <div class="message-bubble">
        <p>Thinking...</p>
      </div>
    `;

    chatbotMessages.appendChild(botMessage);

    chatbotMessages.scrollTop =
      chatbotMessages.scrollHeight;

    // --------------------------------------------------------
    // Send to backend
    // --------------------------------------------------------

    try {

      console.log(
        '[Chatbot] Sending message:',
        message
      );

      const currentBooking =
        activeBookings[selectedBookingIndex] ||
        activeBookings[0] ||
        null;

      const response =
        await fetch(
          'http://localhost:8000/api/chatbot',
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json'
            },

            body: JSON.stringify({
              message: message,
              farmerData: currentBooking
            })
          }
        );

      console.log(
        '[Chatbot] Server response:',
        response.status
      );

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}`
        );
      }

      const data =
        await response.json();

      console.log(
        '[Chatbot] Response data:',
        data
      );

      const reply =
        data.reply ||
        'Sorry, I could not process your question.';

      botMessage.innerHTML = `
        <div class="message-avatar">🌾</div>
        <div class="message-bubble">
          <p>${reply}</p>
        </div>
      `;

    } catch (error) {

      console.error(
        '[Chatbot] Error:',
        error
      );

      botMessage.innerHTML = `
        <div class="message-avatar">🌾</div>
        <div class="message-bubble">
          <p>
            Sorry, I'm unable to connect to the
            QueueKisan server right now.
          </p>
        </div>
      `;
    }

    chatbotMessages.scrollTop =
      chatbotMessages.scrollHeight;
  }

  // ----------------------------------------------------------
  // Send button
  // ----------------------------------------------------------

  chatbotSend.addEventListener(
    'click',
    sendChatMessage
  );

  // ----------------------------------------------------------
  // Enter key
  // ----------------------------------------------------------

  chatbotInput.addEventListener(
    'keydown',
    (event) => {

      if (event.key === 'Enter') {

        event.preventDefault();

        sendChatMessage();
      }
    }
  );

  console.log(
    '[Chatbot] Chatbot initialized successfully'
  );
}