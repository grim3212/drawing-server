const debug = require('debug')('drawing:controller')
const Controller = require('./data/controller')

function setupController(opts) {
  const { io, socket, query } = opts
  const newRoomId = generateRoomID()
  debug(`[${socket.id}]`, `Controller trying to create room [${newRoomId}]`)

  if (!io.sockets.adapter.rooms[newRoomId]) {
    //Set the socket up as a controller
    socket.controller = new Controller({
      io,
      id: socket.id,
      room: newRoomId,
      query
    })

    socket.join(newRoomId)
    debug(`[${socket.id}]`, `Controller joined room '${newRoomId}'`)

    setupListeners(opts)
    notifyController(opts)
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
    debug(
      `[${socket.id}]`,
      `Controller disconnected from room [${socket.controller.getRoom()}]`
    )

    // Stop the timer since we no longer need to increment
    socket.controller.stopTimer()

    var players = io.sockets.adapter.rooms[socket.controller.getRoom()]

    if (players) {
      //Kick each player
      for (var playerId in players.sockets) {
        var playerSocket = io.sockets.connected[playerId]

        playerSocket.emit('kicked', { reason: 'controllerLeft' })
        playerSocket.disconnect(true)
      }
    }
  })

  socket.on('startGame', () => {
    debug(
      `[${socket.id}]`,
      `Starting game in room [${socket.controller.getRoom()}]`
    )

    socket.controller.startGame()
  })
}

function notifyController({ socket }) {
  socket.emit('created', { room: socket.controller.getRoom() })
}

module.exports = {
  setupController
}
