const debug = require('debug')('drawing:player')

function setupPlayer(opts) {
  const { socket, query } = opts
  debug(
    `[${socket.id}]`,
    `Player trying to connect '${query.username}:${query.roomCode}'`
  )

  if (validatePlayer(opts)) {
    setupListeners(opts)
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

    if (!playerSocket.connectionSettings.isPlayer) {
      controller = playerSocket
    } else {
      usernames.push(playerSocket.connectionSettings.username)
    }
  }

  if (controller) {
    debug(`[${socket.id}]`, `Found controller for room [${query.roomCode}]`)
    if (controller.gameState.inProgress) {
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
            joinRoom(opts)
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
          joinRoom(opts)
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

function joinRoom({ socket, query }) {
  debug(
    `[${socket.id}]`,
    `Player joining '${query.username}:${query.roomCode}'`
  )

  socket.connectionSettings = {
    username: query.username,
    room: query.roomCode,
    isPlayer: true
  }
  //Join the room
  socket.join(query.roomCode)
}

function setupListeners(socket) {
  socket.on('disconnect', () => {
    debug(`[${socket.id}]`, `Player disconnected from room [${socket}]`)
  })
}

module.exports = {
  setupPlayer
}
