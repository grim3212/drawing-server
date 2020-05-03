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
    // Used for stopping and starting the timeout for the timer
    this.timeout = 0
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

  emitToEveryone(event, data) {
    // Send the event to the controller
    this.selfSocket().emit(event, data)

    // Send the event to all of the players
    if (this.gameState.players && this.gameState.players.length > 0) {
      for (const player of this.gameState.players) {
        var playerSocket = this.io.sockets.connected[player.id]
        playerSocket.emit(event, data)
      }
    }
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

    this.startTimer()
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

  startTimer() {
    this.timeout = setTimeout(this.timerUpdate, 1000)
  }

  stopTimer() {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = 0
  }

  timerUpdate() {
    if (!(this.gameState.timer < 0)) {
      this.emitToEveryone('timerUpdate', { time: this.gameState.timer })
      // Decrement timer
      this.gameState.timer -= 1
    } else {
      if (this.gameState.state === 'PLAYING') {
        this.gameState.state = 'ROUNDEND'
        this.gameState.timer = 15
        this.emitToEveryone('roundEnd', { time: this.gameState.timer })
      } else if (this.gameState.state === 'ROUNDEND') {
        if (this.gameState.currentRound >= this.gameSettings.rounds) {
          this.gameState.state = 'GAMEEND'
          this.emitToEveryone('gameEnd')
        } else {
          this.gameState.state = 'PLAYING'
          this.gameState.timer = 60
          this.gameState.currentRound += 1
          this.emitToEveryone('nextRound', {
            time: this.gameState.timer,
            round: this.gameState.currentRound
          })
        }
      }
    }
  }
}

module.exports = Controller
