/**
 * QueueKisan — Farmer Notifications
 * Notifications are stored in Supabase and pushed live through Socket.IO.
 */

let notifications = []
let showOnlyUnread = false
let socketConnection = null

function typeForText(text) {
  if (/called|service/i.test(text)) return 'called'
  if (/approaching|ahead|waiting/i.test(text)) return 'approaching'
  if (/generated|confirmed|booked/i.test(text)) return 'generated'
  return 'update'
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} mins ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function loadNotifications() {
  try {
    const rows = await window.KrushiAPI.getNotifications()
    notifications = rows.map((n) => ({
      id: n.id,
      type: typeForText((n.title || '') + ' ' + (n.message || '')),
      title: n.title,
      message: n.message,
      time: timeAgo(n.time),
      read: n.read,
    }))
  } catch (e) {
    console.error('[Notifications] Unable to load notifications:', e)
    notifications = []
  }
}

async function connectRealtime() {
  const currentUser = window.KrushiAPI.getCurrentUser?.()
  if (!currentUser?.userId || !window.KrushiRealtime?.connect) return
  const activeBooking = await window.KrushiAPI.getActiveBooking().catch(() => null)
  const rooms = [`user:${currentUser.userId}`]
  if (activeBooking?.centreId) rooms.push(`centre:${activeBooking.centreId}`)
  if (activeBooking?.id) rooms.push(`token:${activeBooking.id}`)
  socketConnection = await window.KrushiRealtime.connect(rooms, async ({ event, payload }) => {
    if (event === 'queue:updated') {
      await loadNotifications()
      renderNotifications()
      return
    }
    if (event === 'notification:new' || event === 'token:called' || event === 'payment:updated' || event === 'procurement:completed') {
      if (!payload?.userId || String(payload.userId) === String(currentUser.userId)) {
        await loadNotifications()
        renderNotifications()
      }
    }
  })
}

function renderNotificationSkeletons() {
  const list = document.getElementById('notificationList')
  if (list) {
    list.innerHTML = `
      <div class="skeleton-card" style="margin-bottom:10px;">
        <div class="skeleton skeleton-title" style="width:40%;"></div>
        <div class="skeleton skeleton-text" style="width:85%;"></div>
      </div>
      <div class="skeleton-card" style="margin-bottom:10px;">
        <div class="skeleton skeleton-title" style="width:50%;"></div>
        <div class="skeleton skeleton-text" style="width:75%;"></div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton skeleton-title" style="width:35%;"></div>
        <div class="skeleton skeleton-text" style="width:90%;"></div>
      </div>
    `
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  renderNotificationSkeletons()
  await loadNotifications()
  renderNotifications()
  await connectRealtime()

  setInterval(async () => {
    await loadNotifications()
    renderNotifications()
  }, 12000)

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html'
  })

  const chips = document.querySelectorAll('.nf-filter-chip')
  chips[0].addEventListener('click', () => {
    chips[0].classList.add('active')
    chips[1].classList.remove('active')
    showOnlyUnread = false
    renderNotifications()
  })

  chips[1].addEventListener('click', () => {
    chips[1].classList.add('active')
    chips[0].classList.remove('active')
    showOnlyUnread = true
    renderNotifications()
  })

  document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    notifications.forEach((n) => { n.read = true })
    renderNotifications()
    await window.KrushiAPI.markAllNotificationsRead()
  })
})

function renderNotifications() {
  const list = document.getElementById('notificationList')
  const empty = document.getElementById('emptyState')
  const unreadBadge = document.getElementById('unreadBadge')

  list.innerHTML = ''

  const filtered = showOnlyUnread ? notifications.filter((n) => !n.read) : notifications
  const unreadCount = notifications.filter((n) => !n.read).length

  unreadBadge.textContent = unreadCount
  unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none'

  if (filtered.length === 0) {
    list.style.display = 'none'
    empty.style.display = 'block'
    return
  }

  list.style.display = 'flex'
  empty.style.display = 'none'

  filtered.forEach((notif) => {
    const card = document.createElement('div')
    card.className = `nf-card ${notif.read ? '' : 'unread'}`

    let iconHtml = ''
    const iconClass = `icon-type-${notif.type}`

    switch (notif.type) {
      case 'generated':
        iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
        break
      case 'update':
        iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
        break
      case 'approaching':
        iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
        break
      case 'called':
        iconHtml = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`
        break
    }

    card.innerHTML = `
      <div class="nf-icon-wrap ${iconClass}">
        ${iconHtml}
      </div>
      <div class="nf-content">
        <h3 class="nf-title">${notif.title}</h3>
        <p class="nf-message">${notif.message}</p>
        <span class="nf-time">${notif.time}</span>
      </div>
    `

    card.addEventListener('click', () => {
      notif.read = true
      window.KrushiAPI.markNotificationRead(notif.id).catch(() => {})
      if (notif.type === 'generated') window.location.href = 'token-generated.html'
      else if (notif.type === 'called') window.location.href = 'token-called.html'
      else if (notif.type !== 'update') window.location.href = 'live-queue.html'
      else renderNotifications()
    })

    list.appendChild(card)
  })
}
