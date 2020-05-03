const debug = require('debug')('drawing:base')
const express = require('express')
const fs = require('fs')
const { setupPlayer } = require('./src/player')
const { setupController } = require('./src/controller')

let app = express()
let server
let io

var is_production = process.env.NODE_ENV === 'production'

if (is_production) {
  console.log('Using https')

  var options = {
    key: fs.readFileSync('/etc/letsencrypt/live/grim3212.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/grim3212.com/fullchain.pem'),
    requestCert: false
  }

  server = require('https').createServer(options, app)
  io = require('socket.io')(server, {
    origins: ['trends.grim3212.com:443']
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
