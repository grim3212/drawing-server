const express = require("express");
const fs = require("fs");
const path = require("path");

let app = express();
let server;
let io;

var is_production = process.env.NODE_ENV === "production";

if (is_production) {
  console.log("Using https");

  var options = {
    key: fs.readFileSync("/etc/letsencrypt/live/grim3212.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/grim3212.com/fullchain.pem"),
    requestCert: false,
  };

  server = require("https").createServer(options, app);
  io = require("socket.io")(server, {
    origins: ["trends.grim3212.com:443"],
  });
} else {
  console.log("Using http");

  server = require("http").createServer(app);
  io = require("socket.io")(server);
}

// Initialize our websocket server on port 5052
server.listen(5052, () => {
  console.log("started on port 5052");
});

io.on("connection", (socket) => {
  // Log whenever a user connects
  console.log("user connected [" + socket.id + "]");

  socket.on("disconnect", () => {
    console.log("user disconnected [" + socket.id + "]");

    if (socket.controller) {
      console.log("Controller left room  [" + socket.settings.roomId + "]");

      var players = io.sockets.adapter.rooms[socket.settings.roomId];

      if (players) {
        //Kick each player
        for (var clientId in players.sockets) {
          //console.log('client: %s', clientId);
          var client_socket = io.sockets.connected[clientId];

          client_socket.controllerId = 0;
          client_socket.leave(socket.settings.roomId);
          //Send each player back to the home page
          client_socket.emit("controller-disconnect");
        }
      }
    }
  });
});
