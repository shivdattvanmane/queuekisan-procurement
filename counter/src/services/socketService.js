import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_QUEUE_SERVER_URL || undefined

class SocketService {
  constructor() {
    this.socket = null
    this.listeners = new Set()
    this.joinedRooms = new Set()
  }

  connect() {
    if (this.socket?.connected) return this.socket
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        autoConnect: true,
      })

      const forward = (event) => (payload) => {
        this.listeners.forEach((listener) => {
          try {
            listener({ event, ...payload })
          } catch (error) {
            console.error('[SocketService] Listener error', error)
          }
        })
      }

      ;['queue:updated', 'token:called', 'token:verified', 'token:skip', 'token:no-show', 'token:rejoin', 'procurement:started', 'procurement:details_updated', 'procurement:amount_confirmed', 'procurement:completed', 'payment:updated', 'notification:new', 'analytics:updated'].forEach((event) => {
        this.socket.on(event, forward(event))
      })

      this.socket.on('connect', () => {
        if (this.joinedRooms.size) this.socket.emit('join', [...this.joinedRooms])
      })
    }
    return this.socket
  }

  disconnect() {
    if (this.socket) this.socket.disconnect()
    this.socket = null
    this.listeners.clear()
    this.joinedRooms.clear()
  }

  onQueueUpdated(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  joinCentre(centreId) {
    if (!centreId) return
    const room = `centre:${centreId}`
    this.joinedRooms.add(room)
    this.connect()?.emit('join', [room])
  }

  joinUser(userId) {
    if (!userId) return
    const room = `user:${userId}`
    this.joinedRooms.add(room)
    this.connect()?.emit('join', [room])
  }

  joinBooking(bookingId) {
    if (!bookingId) return
    const room = `token:${bookingId}`
    this.joinedRooms.add(room)
    this.connect()?.emit('join', [room])
  }

  emitTokenCalled() {}
  emitQueueChanged() {}
  emitVerificationCompleted() {}
  emitProduceEntered() {}
  emitProcurementStarted() {}
  emitProcurementAmountConfirmed() {}
  emitProcurementCompleted() {}
  emitPaymentUpdated() {}
}

export const socketService = new SocketService()
