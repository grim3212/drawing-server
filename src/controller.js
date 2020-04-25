const debug = require('debug')('drawing:controller')

function setupController(opts) {
  const { io, socket } = opts
  const newRoomId = generateRoomID()
  debug(`[${socket.id}]`, `Controller trying to create room [${newRoomId}]`)

  if (!io.sockets.adapter.rooms[newRoomId]) {
    socket.join(newRoomId)
    setupListeners(socket)

    debug(`[${socket.id}]`, `Controller created room '${newRoomId}'`)
  } else {
    kickController(socket, 'roomAlreadyExists')
  }
}

function generateRoomID() {
  let roomID = ''
  const allowedChars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'

  for (let i = 0; i < 5; i++)
    roomID += allowedChars.charAt(
      Math.floor(Math.random() * allowedChars.length)
    )

  return roomID
}

function kickController({ socket, reason }) {
  debug(`[${socket.id}]`, `Controlled kicked [${reason}]`)
  socket.emit('kicked', { reason })
  socket.disconnect(true)
}

function setupListeners({ io, socket }) {
  socket.on('disconnect', () => {
    debug(`[${socket.id}]`, `Controller disconnected from room [${socket}]`)

    var players = io.sockets.adapter.rooms[socket.settings.roomId]

    if (players) {
      //Kick each player
      for (var playerId in players.sockets) {
        var playerSocket = io.sockets.connected[playerId]

        playerSocket.emit('kicked', { reason: 'controllerLeft' })
        playerSocket.disconnect(true)
      }
    }
  })
}

module.exports = {
  setupController
}
