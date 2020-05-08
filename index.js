const debug = require('debug')('drawing:base')
const express = require('express')
const cors = require('cors')
const { setupPlayer } = require('./src/player')
const { setupController } = require('./src/controller')

const corsOptions = {
  origin: 'https://drawing.grimoid.com',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

let app = express()
app.use(cors(corsOptions))
let server
let io

const is_production = process.env.NODE_ENV === 'production'

if (is_production) {
  server = require('http').createServer(app)
  io = require('socket.io')(server, {
    origins: ['drawing.grimoid.com:443']
  })
} else {
  console.log('Using http')

  server = require('http').createServer(app)
  io = require('socket.io')(server)
}

// Used for server health check
app.get('/api', (req, res) => {
  res.send(true)
})

// Initialize our websocket server on port 5052
server.listen(5052, () => {
  console.log('started on port 5052')
})

io.on('connection', (socket) => {
  var query = JSON.parse(socket.handshake.query.handshake)

  if (query.isPlayer) {
    setupPlayer({ io, socket, query })
  } else if (!query.isPlayer) {
    setupController({ io, socket, query })
  } else {
    debug(`[${socket.id}]`, `Socket failed connection handshake`)
    socket.emit('kicked', { reason: 'failedHandshake' })
    socket.disconnect(true)
  }
})
