(function () {
  const SERVER_URL = window.KRUSHI_QUEUE_SERVER_URL || ''

  async function ensureClientLoaded() {
    if (window.io) return true
    if (!SERVER_URL) return false
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `${SERVER_URL}/socket.io/socket.io.js`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Unable to load Socket.IO client'))
      document.head.appendChild(script)
    })
    return !!window.io
  }

  async function connect(rooms = [], onEvent = () => {}) {
    const ready = await ensureClientLoaded().catch(() => false)
    if (!ready || !window.io) return null
    const socket = window.io(SERVER_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    })
    socket.on('connect', () => {
      if (rooms.length) socket.emit('join', rooms)
    })
    ;['queue:updated', 'token:called', 'token:verified', 'procurement:started', 'procurement:completed', 'payment:updated', 'notification:new', 'analytics:updated'].forEach((eventName) => {
      socket.on(eventName, (payload) => onEvent({ event: eventName, payload }))
    })
    return socket
  }

  window.KrushiRealtime = { connect }
})()
