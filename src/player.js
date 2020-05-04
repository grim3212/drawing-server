const debug = require('debug')('drawing:player')
const Player = require('./data/player')

function setupPlayer(opts) {
  const { socket, query } = opts
  debug(
    `[${socket.id}]`,
    `Player trying to connect '${query.username}:${query.roomCode}'`
  )

  if (validatePlayer(opts)) {
    setupListeners(opts)
    notifyPlayer(opts)
  }
}

function validatePlayer(opts) {
  //Get the options we need
  const { socket, query } = opts
  if (!query.roomCode || query.roomCode.length < 4) {
    kickPlayer(socket, 'invalidRoomCode')
    return false
  } else if (!query.username || query.username.length < 3) {
    kickPlayer(socket, 'invalidUsername')
    return false
  } else {
    debug(`[${socket.id}]`, 'Player passed initial validation')

    if (checkForRoom(opts)) {
      return true
    } else {
      return false
    }
  }
}

function checkForRoom(opts) {
  //Get the options we need
  const { io, socket, query } = opts
  const room = io.sockets.adapter.rooms[query.roomCode]

  if (!room) {
    debug(`[${socket.id}]`, `Room doesn't exist [${query.roomCode}]`)
    kickPlayer(socket, 'roomNotFound')
    return false
  }

  const players = room.sockets

  let controller = null
  const usernames = []

  for (const pSocketId in players) {
    const playerSocket = io.sockets.connected[pSocketId]

    if (playerSocket.controller) {
      controller = playerSocket.controller
    } else {
      usernames.push(playerSocket.player.getUsername())
    }
  }

  if (controller) {
    debug(`[${socket.id}]`, `Found controller for room [${query.roomCode}]`)
    if (controller.gameState.state === 'STARTING') {
      debug(
        `[${socket.id}]`,
        `Game already in progress for room [${query.roomCode}]`
      )
      kickPlayer(socket, 'gameInProgress')
      return false
    } else {
      if (controller.gameSettings.hasMaxPlayers) {
        const numPlayers = usernames.length

        if (numPlayers < controller.gameSettings.maxPlayers) {
          if (checkUniqueUsername({ usernames, username: query.username })) {
            joinRoom(opts, controller)
            return true
          } else {
            debug(
              `[${socket.id}]`,
              `Username is not unique [${query.username}]`
            )
            kickPlayer(socket, 'usernameTaken')
            return false
          }
        }
      } else {
        if (checkUniqueUsername({ usernames, username: query.username })) {
          joinRoom(opts, controller)
          return true
        } else {
          debug(`[${socket.id}]`, `Username is not unique [${query.username}]`)
          kickPlayer(socket, 'usernameTaken')
          return false
        }
      }
    }
  } else {
    debug(
      `[${socket.id}]`,
      `Failed to find controller for room [${query.roomCode}]`
    )
    kickPlayer(socket, 'roomNotFound')
    return false
  }
}

function checkUniqueUsername({ usernames, username }) {
  const names = usernames.map((x) => x.toUpperCase())
  const toCheck = username.toUpperCase()

  if (names.indexOf(toCheck) === -1) {
    return true
  }
  return false
}

function kickPlayer(socket, reason) {
  debug(`[${socket.id}]`, `Player kicked [${reason}]`)
  socket.emit('kicked', { reason })
  socket.disconnect(true)
}

function joinRoom({ io, socket, query }, controller) {
  debug(`[${socket.id}]`, `Player joined '${query.username}:${query.roomCode}'`)

  socket.player = new Player({
    io,
    id: socket.id,
    query,
    controller: controller.getId()
  })

  //Join the room
  socket.join(query.roomCode)

  // Notify the controller that the player joined
  socket.player.getController().playerJoined({ player: socket.player })
}

function setupListeners({ socket }) {
  socket.on('disconnect', () => {
    debug(
      `[${socket.id}]`,
      `Player disconnected from room [${socket.player.getRoom()}]`
    )
    const controller = socket.player.getController()
    if (controller) {
      // Notify the controller that the player left
      controller.playerLeft({ id: socket.id })
    }
  })

  socket.on('drawing', (data) => {
    socket.player.getController().playerDrawing(data)
  })

  socket.on('newGuess', (data) => {
    debug(`[${socket.id}]`, `Player sent guess [${data.text}]`)
    socket.player.getController().newGuess(data)
  })

  socket.on('promptChosen', (data) => {
    debug(`[${socket.id}]`, `Drawer chose prompt [${data.prompt}]`)
    socket.player.getController().setPrompt(data)
  })
}

function notifyPlayer({ socket }) {
  socket.emit('joined', { id: socket.id })
}

module.exports = {
  setupPlayer
}
