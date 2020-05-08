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
      correct: false,
      locked: false
    }

    this.gameState.players.push(playerObj)
    this.selfSocket().emit('playerJoined', { player: playerObj })
  }

  playerLeft({ id }) {
    // This way the scoreboard stays up to date
    if (this.gameState.state !== 'GAMEEND') {
      const pIdx = this.gameState.players.findIndex((el) => el.id === id)
      if (pIdx > -1) this.gameState.players.splice(pIdx, 1)

      this.selfSocket().emit('playerLeft', { id })
    }
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

  clearCanvas() {
    this.selfSocket().emit('clearCanvas')
  }

  lockInPlayer(data) {
    const { player, icon, color } = data
    this.selfSocket().emit('lockInPlayer', data)

    const pIdx = this.gameState.players.findIndex((el) => el.id === player)
    if (pIdx > -1) {
      // Mark the player as locked
      this.gameState.players[pIdx].locked = true

      this.gameState.players[pIdx].icon = icon

      this.gameState.players[pIdx].favoriteColor = color
    }
  }

  allPlayersLocked() {
    for (const player of this.gameState.players) {
      if (!player.locked) {
        return false
      }
    }
    return true
  }

  startGame() {
    // Make sure all the players are locked in
    if (this.allPlayersLocked()) {
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
      const playerObj = {
        player,
        time,
        correct
      }

      // We don't want to send the correct text to each client they don't need it
      if (!correct) {
        playerObj.text = text
      } else {
        // If they were correct mark them as correct
        this.markPlayerCorrect(player.id)
      }

      for (const checkPlayer of this.gameState.players) {
        var playerSocket = this.io.sockets.connected[checkPlayer.id]

        if (correct) {
          if (checkPlayer.id === player.id) {
            // Tell original sender that they were correct
            playerSocket.emit('correctGuess', newObj)
          } else {
            playerSocket.emit('newGuess', playerObj)
          }
        } else {
          playerSocket.emit('newGuess', playerObj)
        }
      }
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

    // Update the player that was correct with the updated points
    var playerSocket = this.io.sockets.connected[playerId]
    playerSocket.emit('updatePoints', { points: newPlayer.points })

    var endRoundEarly = true
    for (const checkPlayer of this.gameState.players) {
      // Make sure we aren't checking the drawer for correctness
      if (
        checkPlayer.id !== this.gameState.currentDrawer &&
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
    this.selfSocket().emit('promptChosen', { prompt })

    // Start the round timer
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
          this.handleGameEnd()
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

  handleGameEnd() {
    var sortedPlayers = [...this.gameState.players].sort((a, b) => {
      if (a.points < b.points) {
        return 1
      }
      if (a.points > b.points) {
        return -1
      }
      return 0
    })

    for (var k = 0; k < sortedPlayers.length; k++) {
      for (var h = 1; h < sortedPlayers.length + 1; h++) {
        if (sortedPlayers[k + h] !== undefined && !sortedPlayers[k + h].tie) {
          if (sortedPlayers[k].points === sortedPlayers[h + k].points) {
            sortedPlayers[k].rank = k + 1
            sortedPlayers[h + k].rank = k + 1
            sortedPlayers[k].tie = true
            sortedPlayers[h + k].tie = true
          }
        }
      }
    }

    for (var [idx, player] of sortedPlayers.entries()) {
      var playerSocket = this.io.sockets.connected[player.id]

      if (player.rank === undefined) {
        player.rank = idx + 1
      }
      // Notify each player of the rank and points if they need them
      playerSocket.emit('gameEnd', {
        rank: player.rank,
        points: player.points,
        tie: player.tie
      })
    }

    this.selfSocket().emit('gameEnd', { sortedPlayers })
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
        const nextPlayer =
          playerOptions[Math.floor(Math.random() * playerOptions.length)]

        this.gameState.previousDrawers.push(nextPlayer)
        // Return a random player id
        return nextPlayer
      }
    }

    return -1
  }

  // Returns 3 random prompts that haven't been used before
  randomPrompts(n = 3) {
    // Construct a new array of the available options that we are pulling from
    var options = []
    for (const prompt of prompts) {
      if (!this.gameState.previousPrompts.includes(prompt)) {
        options.push(prompt)
      }
    }

    var result = new Array(n),
      len = options.length,
      taken = new Array(len)
    if (n > len)
      throw new RangeError('getRandom: more elements taken than available')
    while (n--) {
      var x = Math.floor(Math.random() * len)
      result[n] = options[x in taken ? taken[x] : x]
      taken[x] = --len in taken ? taken[len] : len
    }
    return result
  }
}

module.exports = Controller
