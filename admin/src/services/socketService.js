import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_QUEUE_SERVER_URL || undefined

class AdminSocketService {
  constructor() {
    this.socket = null
    this.listeners = new Set()
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
            console.error('[AdminSocketService] Listener error', error)
          }
        })
      }
      ;['queue:updated', 'token:called', 'token:verified', 'procurement:started', 'procurement:completed', 'payment:updated', 'notification:new', 'analytics:updated'].forEach((event) => {
        this.socket.on(event, forward(event))
      })
      this.socket.on('connect', () => {
        this.socket.emit('join', ['admin:global'])
      })
    }
    return this.socket
  }

  onUpdate(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

export const adminSocketService = new AdminSocketService()
