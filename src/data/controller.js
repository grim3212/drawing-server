const { defaultGameState } = require('../util')

class Controller {
  constructor({ io, id, room, query }) {
    this.io = io
    // Setup socket props
    this.connectionSettings = {
      id,
      room
    }
    // Controll the rules and other aspects of the game
    this.gameSettings = query.gameSettings
    // Handles the running game state and is the main source of truth for the clients
    this.gameState = defaultGameState()
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

  playerJoined({ player }) {
    const playerObj = {
      id: player.getId(),
      username: player.connectionSettings.username
    }

    this.gameState.players.push(playerObj)
    this.selfSocket().emit('playerJoined', { player: playerObj })
  }

  playerLeft({ id }) {
    const pIdx = this.gameState.players.findIndex((el) => el.id === id)
    if (pIdx > -1) this.gameState.players.splice(pIdx, 1)

    this.selfSocket().emit('playerLeft', { id })
  }

  startGame() {
    this.gameState.state = 'PLAYING'
    this.selfSocket().emit('gameStarted')

    if (this.gameState.players && this.gameState.players.length > 0) {
      for (const player of this.gameState.players) {
        var playerSocket = this.io.sockets.connected[player.id]
        playerSocket.emit('gameStarted')
      }
    }
  }

  playerDrawing(data) {
    this.selfSocket().emit('drawing', data)
  }

  newGuess(data) {
    // Send the new guess to the controller as well
    this.selfSocket().emit('newGuess', data)

    // Send the new guess to all players except the one who sent it
    if (this.gameState.players && this.gameState.players.length > 0) {
      for (const player of this.gameState.players) {
        if (player.id !== data.player.id) {
          var playerSocket = this.io.sockets.connected[player.id]
          playerSocket.emit('newGuess', data)
        }
      }
    }
  }
}

module.exports = Controller
