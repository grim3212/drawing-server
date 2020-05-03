function defaultGameState() {
  return {
    state: 'STARTUP',
    players: [],
    timer: 60,
    currentRound: 1
  }
}

function getSocket({ io, id }) {
  return io.sockets.connected[id]
}

function getControllerInRoom({ io, room }) {
  var sockets = io.sockets.adapter.rooms[room].sockets

  for (var socketId in sockets) {
    var connSocket = io.sockets.connected[socketId]

    //look for a client
    if (connSocket.controller) {
      return connSocket
    }
  }
}

module.exports = {
  defaultGameState,
  getSocket,
  getControllerInRoom
}
