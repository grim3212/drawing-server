class Player {
  constructor({ io, id, controller, query: { room, username } }) {
    this.io = io
    // Setup socket props
    this.connectionSettings = {
      id,
      room,
      username,
      controller
    }
  }

  selfSocket() {
    return this.io.sockets.connected[this.getId()]
  }

  getId() {
    return this.connectionSettings.id
  }

  getRoom() {
    return this.connectionSettings.room
  }

  getUsername() {
    return this.connectionSettings.username
  }

  getController() {
    return this.getControllerSocket()
      ? this.getControllerSocket().controller
      : null
  }

  getControllerSocket() {
    return this.io.sockets.connected[this.connectionSettings.controller]
  }
}

module.exports = Player
