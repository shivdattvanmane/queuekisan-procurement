import { Server } from 'socket.io'

function roomSet(meta = {}) {
  const rooms = new Set(['admin:global'])
  if (meta.centreId) rooms.add(`centre:${meta.centreId}`)
  if (meta.userId) rooms.add(`user:${meta.userId}`)
  if (meta.bookingId) rooms.add(`token:${meta.bookingId}`)
  return [...rooms]
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  })

  io.on('connection', (socket) => {
    socket.on('join', (rooms = []) => {
      const safeRooms = Array.isArray(rooms) ? rooms.filter(Boolean) : []
      safeRooms.forEach((room) => socket.join(room))
    })

    socket.on('leave', (rooms = []) => {
      const safeRooms = Array.isArray(rooms) ? rooms.filter(Boolean) : []
      safeRooms.forEach((room) => socket.leave(room))
    })
  })

  function broadcast(event, payload = {}, meta = {}) {
    const rooms = roomSet(meta)
    rooms.forEach((room) => io.to(room).emit(event, payload))
  }

  return {
    io,
    broadcast,
  }
}
