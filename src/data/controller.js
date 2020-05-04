const { defaultGameState } = require('../util')
const prompts = require('../prompts')

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
      username: player.connectionSettings.username,
      points: 0,
      correct: false
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
    const drawer = this.nextDrawer()
    this.gameState.currentDrawer = drawer

    this.gameState.state = 'PLAYING'
    this.selfSocket().emit('gameStarted', { drawer })

    if (this.gameState.players && this.gameState.players.length > 0) {
      for (const player of this.gameState.players) {
        var playerSocket = this.io.sockets.connected[player.id]
        if (player.id === drawer) {
          // Start the drawer with random prompts
          playerSocket.emit('gameStarted', {
            drawer: true,
            prompts: this.randomPrompts()
          })
        } else {
          playerSocket.emit('gameStarted', { drawer: false })
        }
      }
    }
  }

  playerDrawing(data) {
    this.selfSocket().emit('drawing', data)
  }

  newGuess({ player, text, time }) {
    // Correct guess?
    const correct = this.gameState.prompt === text.toLowerCase()

    const newObj = {
      player,
      text,
      time,
      correct
    }
    // Send the new guess to the controller as well
    this.selfSocket().emit('newGuess', newObj)

    // Send the new guess to all players except the one who sent it
    if (this.gameState.players && this.gameState.players.length > 0) {
      for (const checkPlayer of this.gameState.players) {
        if (checkPlayer.id !== player.id) {
          var playerSocket = this.io.sockets.connected[checkPlayer.id]
          playerSocket.emit('newGuess', newObj)
        }
      }
    }

    if (correct) {
      // Tell original sender that they were correct
      this.io.sockets.connected[player.id].emit('correctGuess')
      this.markPlayerCorrect(player.id)
    }
  }

  markPlayerCorrect(playerId) {
    const foundIndex = this.gameState.players.findIndex(
      (x) => x.id === playerId
    )
    var newPlayer = this.gameState.players[foundIndex]
    newPlayer.correct = true
    newPlayer.points += this.gameState.timer
    this.gameState.players[foundIndex] = newPlayer

    // Update client controller state
    this.selfSocket().emit('updatePlayerState', newPlayer)

    var endRoundEarly = true
    for (const checkPlayer of this.gameState.players) {
      // Make sure we aren't checking the drawer for correctness
      if (
        checkPlayer !== this.gameState.currentDrawer &&
        !checkPlayer.correct
      ) {
        endRoundEarly = false
        break
      }
    }

    if (endRoundEarly) {
      this.stopTimer()
      this.roundEnd()
    }
  }

  setPrompt({ prompt }) {
    this.gameState.prompt = prompt
    this.emitToEveryone('promptChosen', { prompt })
    this.startTimer()
  }

  startTimer() {
    this.timeout = setTimeout(() => this.timerUpdate(), 1000)
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
      // Next iteration
      this.startTimer()
    } else {
      if (this.gameState.state === 'PLAYING') {
        this.roundEnd()
      } else if (this.gameState.state === 'ROUNDEND') {
        if (this.gameState.currentRound >= this.gameSettings.rounds) {
          this.stopTimer()
          this.gameState.state = 'GAMEEND'
          this.emitToEveryone('gameEnd')
        } else {
          this.gameState.state = 'PLAYING'
          this.gameState.timer = 60
          this.gameState.currentRound += 1

          // Grab the next drawer
          const drawer = this.nextDrawer()
          this.gameState.currentDrawer = drawer

          // Controller update
          this.selfSocket().emit('nextRound', {
            time: this.gameState.timer,
            round: this.gameState.currentRound,
            drawer
          })

          if (this.gameState.players && this.gameState.players.length > 0) {
            for (const player of this.gameState.players) {
              var playerSocket = this.io.sockets.connected[player.id]
              if (player.id === drawer) {
                // Start the drawer with random prompts
                playerSocket.emit('nextRound', {
                  drawer: true,
                  prompts: this.randomPrompts(),
                  time: this.gameState.timer,
                  round: this.gameState.currentRound
                })
              } else {
                playerSocket.emit('nextRound', {
                  drawer: false,
                  time: this.gameState.timer,
                  round: this.gameState.currentRound
                })
              }
            }
          }
        }
      }
    }
  }

  roundEnd() {
    this.gameState.state = 'ROUNDEND'
    this.gameState.timer = 15
    // Reset every player to not be a correct guesser
    this.gameState.players.forEach((part, index, theArray) => {
      theArray[index].correct = false
    })
    this.emitToEveryone('roundEnd', { time: this.gameState.timer })

    // Next iteration
    this.startTimer()
  }

  nextDrawer() {
    if (this.gameState.players && this.gameState.players.length > 0) {
      const playerOptions = []
      for (const player of this.gameState.players) {
        if (!this.gameState.previousDrawers.includes(player.id)) {
          playerOptions.push(player.id)
        }
      }
      if (playerOptions.length < 1) {
        this.gameState.previousDrawers = []
        // No player options choose clear the previous players and return a random player
        return this.nextDrawer()
      } else {
        const nextPlayer = playerOptions.splice(
          Math.floor(Math.random() * playerOptions.length),
          1
        )
        this.gameState.previousDrawers.push(nextPlayer)
        // Return a random player id
        return nextPlayer
      }
    }

    return -1
  }

  // Returns 3 random prompts that haven't been used before
  randomPrompts() {
    const prompt1 = prompts.splice(
      Math.floor(Math.random() * prompts.length),
      1
    )
    const prompt2 = prompts.splice(
      Math.floor(Math.random() * prompts.length),
      1
    )
    const prompt3 = prompts.splice(
      Math.floor(Math.random() * prompts.length),
      1
    )
    return [prompt1, prompt2, prompt3]
  }
}

module.exports = Controller
